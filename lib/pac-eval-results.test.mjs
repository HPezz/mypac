import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildCanonicalEvaluationResult,
  renderEvaluationReport,
  serializeCanonicalEvaluationResult,
  writeEvaluationOutputs,
} from "./pac-eval-results.ts";

const telemetry = {
  sessions: [{ file: "session.jsonl", id: "session-1", startedAt: "2026-01-01T00:00:00.000Z", cwd: "/temporary/checkout" }],
  messages: 2,
  assistantTurns: 1,
  tokens: { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, total: 20 },
  cost: { reported: 0.2, estimated: null, total: 0.2, currency: "USD" },
  context: { samples: [15], peak: 15, max: 100 },
  modelsUsed: ["openai-codex/gpt-5.4"],
  thinkingLevelsUsed: ["medium"],
  actualConfiguration: { provider: "openai-codex", model: "gpt-5.4", thinking: "medium" },
  malformedLines: 0,
};

function run(profileId, overrides = {}) {
  return {
    schemaVersion: 1,
    evaluationId: "comparison",
    scenarioId: "change",
    profileId,
    status: "passed",
    piVersion: "0.84.3",
    requestedConfiguration: { model: "openai-codex/gpt-5.4", thinking: profileId === "control" ? "medium" : "high" },
    executionPolicy: { tools: ["read", "edit", "write"], packageResources: {} },
    package: null,
    actualConfiguration: { provider: "openai-codex", model: "gpt-5.4", thinking: profileId === "control" ? "medium" : "high" },
    configurationMatched: true,
    telemetry: { ...telemetry, actualConfiguration: { provider: "openai-codex", model: "gpt-5.4", thinking: profileId === "control" ? "medium" : "high" } },
    repository: { source: "/source/repository", ref: "main", baseSha: "abc123" },
    child: { exitCode: 0, signal: null, timedOut: false, durationMs: profileId === "control" ? 1000 : 1200 },
    verification: [{ command: ["npm", "test"], status: "passed", exitCode: 0, durationMs: 100 }],
    git: {
      status: " M lib/change.ts\n",
      changedFiles: ["lib/change.ts"],
      diffPath: `runs/change/${profileId}/diff.patch`,
      commitsPath: `runs/change/${profileId}/commits.txt`,
      commits: [{ sha: `${profileId}-sha`, subject: "Implement change" }],
    },
    artifacts: [`runs/change/${profileId}/artifacts/result.txt`],
    paths: {
      stdout: `runs/change/${profileId}/stdout.log`,
      stderr: `runs/change/${profileId}/stderr.log`,
      sessionDirectory: `runs/change/${profileId}/session`,
      result: `runs/change/${profileId}/result.json`,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: profileId === "control" ? "2026-01-01T00:00:01.000Z" : "2026-01-01T00:00:02.200Z",
    ...overrides,
  };
}

function manifest(outputDirectory) {
  return {
    version: 1,
    id: "comparison",
    outputDirectory,
    repository: { path: "/source/repository", ref: "main" },
    profiles: [
      { id: "control", model: "openai-codex/gpt-5.4", thinking: "medium" },
      { id: "candidate", model: "openai-codex/gpt-5.4", thinking: "high", workflow: "/pac-lwot" },
    ],
    scenarios: [{
      id: "change",
      prompt: "Implement the requested change.",
      timeoutMs: 10_000,
      verify: [{ command: "npm", args: ["test"], timeoutMs: 5_000 }],
      artifacts: ["result.txt"],
    }],
  };
}

test("canonical result deterministically records a normal multi-profile comparison", () => {
  const result = buildCanonicalEvaluationResult(manifest("/output"), [run("candidate"), run("control")]);

  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.evaluation, {
    id: "comparison",
    piVersion: "0.84.3",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:02.200Z",
    durationMs: 2200,
  });
  assert.deepEqual(result.repository, { source: "/source/repository", ref: "main", sha: "abc123" });
  assert.deepEqual(result.matrix.runs, [
    { scenarioId: "change", profileId: "control" },
    { scenarioId: "change", profileId: "candidate" },
  ]);
  assert.deepEqual(result.runs.map(({ profileId }) => profileId), ["control", "candidate"]);
  assert.equal(result.runs[0].telemetry.sessions[0].cwd, ".");
  assert.deepEqual(result.runs[0].git.commits, [{ sha: "control-sha", subject: "Implement change" }]);
  assert.deepEqual(result.runs[0].retainedArtifacts.map(({ path }) => path), [
    "runs/change/control/artifacts/result.txt",
    "runs/change/control/commits.txt",
    "runs/change/control/diff.patch",
    "runs/change/control/result.json",
    "runs/change/control/stderr.log",
    "runs/change/control/stdout.log",
  ]);
  assert.equal(serializeCanonicalEvaluationResult(result), serializeCanonicalEvaluationResult(result));
});

test("report can be regenerated identically from canonical JSON without child sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pac-eval-report-"));
  const result = buildCanonicalEvaluationResult(manifest(directory), [run("control"), run("candidate")]);
  await writeEvaluationOutputs(directory, result);

  const canonical = JSON.parse(await readFile(join(directory, "results.json"), "utf8"));
  const firstHtml = await readFile(join(directory, "report.html"), "utf8");
  const regenerated = renderEvaluationReport(canonical);

  assert.equal(regenerated, firstHtml);
  assert.match(firstHtml, /control/);
  assert.match(firstHtml, /candidate/);
  assert.match(firstHtml, /Input tokens/);
  assert.match(firstHtml, /Human review/);
  assert.doesNotMatch(firstHtml, /fixture prompt/);
  await writeFile(join(directory, "report-regenerated.html"), regenerated);
});
