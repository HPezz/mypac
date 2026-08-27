import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { buildPiInvocation, parseManifest, runEvaluation } from "./pac-eval.ts";

const execFileAsync = promisify(execFile);

async function writeManifest(directory, manifest) {
  const path = join(directory, "evaluation.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

function validManifest(repository, outputDirectory) {
  return {
    version: 1,
    id: "smoke",
    outputDirectory,
    repository: { path: repository, ref: "HEAD" },
    profiles: [
      { id: "control", model: "openai-codex/gpt-5.4", thinking: "medium" },
      {
        id: "candidate",
        model: "openai-codex/gpt-5.4",
        thinking: "high",
        workflow: "/pac-lwot",
        package: { path: repository, ref: "HEAD", prompts: true, skills: true },
      },
    ],
    scenarios: [
      {
        id: "narrow-change",
        prompt: "Make the requested change.",
        timeoutMs: 1000,
        verify: [{ command: "node", args: ["--version"], timeoutMs: 500 }],
        artifacts: ["result.txt"],
      },
    ],
  };
}

test("manifest validation rejects unsupported thinking levels and unsafe artifact paths", () => {
  const manifest = validManifest("/tmp/source", "/tmp/output");
  manifest.profiles[0].thinking = "ultra";
  assert.throws(() => parseManifest(manifest), /thinking is not supported/);

  manifest.profiles[0].thinking = "medium";
  manifest.scenarios[0].artifacts = ["../secret"];
  assert.throws(() => parseManifest(manifest), /must stay inside/);
});

test("pinned Pi invocation uses JSON mode, explicit model/thinking, a fresh session directory, and safe tools", () => {
  const invocation = buildPiInvocation(
    { id: "profile", model: "openai-codex/gpt-5.4", thinking: "high", workflow: "/pac-lwot" },
    "/tmp/session",
    "Change one file.",
  );

  assert.equal(invocation.command, process.execPath);
  assert.match(invocation.args[0], /@earendil-works\/pi-coding-agent\/dist\/bundle\/cli\.js$/);
  assert.deepEqual(invocation.args.slice(1), [
    "--mode", "json",
    "--model", "openai-codex/gpt-5.4",
    "--thinking", "high",
    "--session-dir", "/tmp/session",
    "--tools", "read,edit,write,grep,find,ls",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--approve",
    "--",
    "/pac-lwot Change one file.",
  ]);
});

test("dry-run validates and previews the expanded matrix without launching Pi", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pac-eval-dry-"));
  const repository = join(directory, "repository");
  const outputDirectory = join(directory, "output");
  const manifestPath = await writeManifest(directory, validManifest(repository, outputDirectory));

  const { stdout } = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", "scripts/pac-eval.ts", manifestPath, "--dry-run"],
    { cwd: process.cwd() },
  );
  const preview = JSON.parse(stdout);

  assert.equal(preview.evaluationId, "smoke");
  assert.deepEqual(preview.scenarios, ["narrow-change"]);
  assert.deepEqual(preview.profiles, ["control", "candidate"]);
  assert.equal(preview.totalRuns, 2);
  assert.deepEqual(
    preview.runs.map(({ scenarioId, profileId, model, thinking }) => ({ scenarioId, profileId, model, thinking })),
    [
      {
        scenarioId: "narrow-change",
        profileId: "control",
        model: "openai-codex/gpt-5.4",
        thinking: "medium",
      },
      {
        scenarioId: "narrow-change",
        profileId: "candidate",
        model: "openai-codex/gpt-5.4",
        thinking: "high",
      },
    ],
  );
  assert.equal(preview.outputDirectory, outputDirectory);
});

async function initializeRepository(path) {
  await mkdir(path, { recursive: true });
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: path });
  await execFileAsync("git", ["config", "user.name", "Eval Fixture"], { cwd: path });
  await execFileAsync("git", ["config", "user.email", "eval@example.test"], { cwd: path });
  await writeFile(join(path, "README.md"), "fixture\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: path });
  await execFileAsync("git", ["commit", "-q", "-m", "fixture"], { cwd: path });
  return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: path })).stdout.trim();
}

async function writeFakePi(path) {
  await writeFile(path, `
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const sessionDir = value("--session-dir");
const requestedModel = value("--model");
const thinking = value("--thinking");
const [provider, ...modelParts] = requestedModel.split("/");
const model = process.env.FAKE_MISMATCH === "1" ? "different-model" : modelParts.join("/");
await mkdir(sessionDir, { recursive: true });
await writeFile(join(sessionDir, "session.jsonl"), [
  JSON.stringify({ type: "session", version: 3, id: "fixture", timestamp: "2026-01-01T00:00:00.000Z", cwd: process.cwd() }),
  JSON.stringify({ type: "model_change", id: "1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", provider, modelId: model }),
  JSON.stringify({ type: "thinking_level_change", id: "2", parentId: "1", timestamp: "2026-01-01T00:00:00.000Z", thinkingLevel: thinking }),
].join("\\n") + "\\n");
await writeFile("implementation.txt", "changed\\n");
await writeFile("result.txt", "artifact\\n");
console.log("fake pi stdout");
console.error("fake pi stderr");
if (process.env.FAKE_TIMEOUT === "1") await new Promise((resolve) => setTimeout(resolve, 10_000));
if (process.env.FAKE_FAILURE === "1") process.exitCode = 7;
`);
}

test("execution isolates the checkout, verifies externally, and retains normalized evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pac-eval-run-"));
  const repository = join(directory, "source");
  const baseSha = await initializeRepository(repository);
  const fakePi = join(directory, "fake-pi.mjs");
  await writeFakePi(fakePi);
  const manifest = validManifest(repository, join(directory, "eval-output"));
  manifest.profiles = [manifest.profiles[0]];
  manifest.scenarios[0].verify = [{
    command: process.execPath,
    args: ["-e", "require('node:fs').accessSync('implementation.txt')"],
    timeoutMs: 1000,
  }];

  const results = await runEvaluation(manifest, {
    piCommand: { command: process.execPath, leadingArgs: [fakePi] },
  });
  const result = results[0];

  assert.equal(result.status, "passed");
  assert.equal(result.repository.baseSha, baseSha);
  assert.deepEqual(result.actualConfiguration, {
    provider: "openai-codex",
    model: "gpt-5.4",
    thinking: "medium",
  });
  assert.equal(result.configurationMatched, true);
  assert.deepEqual(result.git.changedFiles, ["implementation.txt", "result.txt"]);
  assert.equal(result.verification[0].status, "passed");
  assert.match(await readFile(join(manifest.outputDirectory, result.paths.stdout), "utf8"), /fake pi stdout/);
  assert.match(await readFile(join(manifest.outputDirectory, result.paths.stderr), "utf8"), /fake pi stderr/);
  assert.equal(await readFile(join(manifest.outputDirectory, result.artifacts[0]), "utf8"), "artifact\n");
  await assert.rejects(access(join(repository, "implementation.txt")));
  await assert.rejects(access(join(manifest.outputDirectory, "runs", "narrow-change", "control", "repository")));
});

test("failed, timed-out, mismatched, and verification-failed children retain normalized results", async () => {
  const cases = [
    { name: "failure", environment: { FAKE_FAILURE: "1" }, expected: "child_failed" },
    { name: "timeout", environment: { FAKE_TIMEOUT: "1" }, expected: "timed_out", timeoutMs: 50 },
    { name: "mismatch", environment: { FAKE_MISMATCH: "1" }, expected: "configuration_mismatch" },
    { name: "verification", expected: "verification_failed", verificationFails: true },
  ];

  for (const fixture of cases) {
    const directory = await mkdtemp(join(tmpdir(), `pac-eval-${fixture.name}-`));
    const repository = join(directory, "source");
    await initializeRepository(repository);
    const fakePi = join(directory, "fake-pi.mjs");
    await writeFakePi(fakePi);
    const manifest = validManifest(repository, join(directory, "eval-output"));
    manifest.profiles = [manifest.profiles[0]];
    manifest.scenarios[0].timeoutMs = fixture.timeoutMs ?? 1000;
    manifest.scenarios[0].verify = fixture.verificationFails
      ? [{ command: process.execPath, args: ["-e", "process.exit(3)"], timeoutMs: 1000 }]
      : [];

    const [result] = await runEvaluation(manifest, {
      piCommand: { command: process.execPath, leadingArgs: [fakePi] },
      environment: fixture.environment,
    });

    assert.equal(result.status, fixture.expected, fixture.name);
    assert.equal(JSON.parse(await readFile(join(manifest.outputDirectory, result.paths.result), "utf8")).status, fixture.expected);
    assert.equal(await readFile(join(manifest.outputDirectory, result.artifacts[0]), "utf8"), "artifact\n");
  }
});
