import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { expandMatrix, parseManifest } from "../../scripts/pac-eval.ts";

const execFileAsync = promisify(execFile);
const fixtureDirectory = dirname(new URL(import.meta.url).pathname);

async function fixtureRepository() {
  const repository = await mkdtemp(join(tmpdir(), "pac-eval-phase1-"));
  await mkdir(join(repository, "evaluations"), { recursive: true });
  await cp(fixtureDirectory, join(repository, "evaluations", "phase1-model-comparison"), { recursive: true });
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: repository });
  await execFileAsync("git", ["config", "user.name", "Eval Fixture"], { cwd: repository });
  await execFileAsync("git", ["config", "user.email", "eval@example.test"], { cwd: repository });
  await execFileAsync("git", ["add", "."], { cwd: repository });
  await execFileAsync("git", ["commit", "-q", "-m", "fixture"], { cwd: repository });
  return repository;
}

async function verify(repository, name) {
  return execFileAsync(process.execPath, [join(fixtureDirectory, `verify-${name}.mjs`)], { cwd: repository });
}

test("Phase 1 manifest is exactly three scenarios by four intended profiles", async () => {
  const manifest = parseManifest(
    JSON.parse(await readFile(join(fixtureDirectory, "manifest.json"), "utf8")),
    fixtureDirectory,
  );
  const matrix = expandMatrix(manifest).map(({ scenario, profile }) => ({
    scenario: scenario.id,
    profile: profile.id,
    model: profile.model,
    thinking: profile.thinking,
  }));

  assert.equal(matrix.length, 12);
  assert.deepEqual([...new Set(matrix.map(({ scenario }) => scenario))], [
    "routing-judgement",
    "narrow-implementation",
    "deterministic-diagnosis",
  ]);
  assert.deepEqual(matrix.slice(0, 4), [
    { scenario: "routing-judgement", profile: "luna-max", model: "openai-codex/gpt-5.6-luna", thinking: "max" },
    { scenario: "routing-judgement", profile: "terra-medium", model: "openai-codex/gpt-5.6-terra", thinking: "medium" },
    { scenario: "routing-judgement", profile: "terra-high", model: "openai-codex/gpt-5.6-terra", thinking: "high" },
    { scenario: "routing-judgement", profile: "sol-medium", model: "openai-codex/gpt-5.6-sol", thinking: "medium" },
  ]);
});

test("routing verifier accepts only the correct no-execution decision", async () => {
  const repository = await fixtureRepository();
  await assert.rejects(verify(repository, "routing"));
  const output = join(repository, "evaluations", "phase1-model-comparison", "workspace", "routing-decision.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ decision: "stop", implementationRequired: false, nextWorkflow: null, evidence: "release-record:completed" }, null, 2)}\n`);
  await assert.doesNotReject(verify(repository, "routing"));
});

test("implementation verifier requires behavior, regression coverage, and narrow scope", async () => {
  const repository = await fixtureRepository();
  await assert.rejects(verify(repository, "implementation"));
  const root = join(repository, "evaluations", "phase1-model-comparison", "fixtures", "implementation");
  await writeFile(join(root, "labels.mjs"), `export function normalizeLabels(labels) {\n  return [...new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))];\n}\n`);
  await writeFile(join(root, "labels.test.mjs"), `${await readFile(join(root, "labels.test.mjs"), "utf8")}\n// Regression: empty and duplicate labels are removed.\n`);
  await assert.doesNotReject(verify(repository, "implementation"));
});

test("diagnosis verifier requires a general cache-collision fix and regression coverage", async () => {
  const repository = await fixtureRepository();
  await assert.rejects(verify(repository, "diagnosis"));
  const root = join(repository, "evaluations", "phase1-model-comparison", "fixtures", "diagnosis");
  const source = await readFile(join(root, "config-cache.mjs"), "utf8");
  await writeFile(join(root, "config-cache.mjs"), source.replaceAll("basename", "resolve"));
  await writeFile(join(root, "config-cache.test.mjs"), `${await readFile(join(root, "config-cache.test.mjs"), "utf8")}\n// Regression: cache keys use full directory identity.\n`);
  await assert.doesNotReject(verify(repository, "diagnosis"));
});
