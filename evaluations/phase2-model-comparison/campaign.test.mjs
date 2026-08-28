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
const implementationRoot = "evaluations/phase2-model-comparison/fixtures/implementation";
const diagnosisRoot = "evaluations/phase2-model-comparison/fixtures/diagnosis";
const implementationTest = "test/work-queue.test.mjs";
const diagnosisTest = "test/settings.test.mjs";

async function fixtureRepository() {
  const repository = await mkdtemp(join(tmpdir(), "pac-eval-phase2-"));
  await mkdir(join(repository, "evaluations"), { recursive: true });
  await cp(fixtureDirectory, join(repository, "evaluations", "phase2-model-comparison"), { recursive: true });
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

const goodEligibility = `export function isQueueVisible(item) {
  return item.status !== "done" && item.status !== "archived";
}

export function blockingDependencies(item, allItems) {
  const byId = new Map(allItems.map((candidate) => [candidate.id, candidate]));
  return item.dependsOn.filter((dependencyId) => byId.get(dependencyId)?.status !== "done");
}
`;

const goodWorkQueue = `import { blockingDependencies, isQueueVisible } from "./eligibility.mjs";
import { normalizeWorkItem } from "./normalize-work-item.mjs";

export function buildWorkQueue(workItems, { limit = Infinity } = {}) {
  const normalized = workItems.map(normalizeWorkItem);
  const visible = normalized.filter(isQueueVisible);
  const blocked = visible.filter((item) => blockingDependencies(item, normalized).length > 0);
  const items = visible.filter((item) => blockingDependencies(item, normalized).length === 0);
  return {
    total: normalized.length,
    items: items.slice(0, limit),
    blocked,
  };
}
`;

const cohesiveWorkQueue = `import { isQueueVisible } from "./eligibility.mjs";
import { normalizeWorkItem } from "./normalize-work-item.mjs";

export function buildWorkQueue(workItems, { limit = Infinity } = {}) {
  const normalized = workItems.map(normalizeWorkItem);
  const itemsById = new Map(normalized.map((item) => [item.id, item]));
  const visible = normalized.filter(isQueueVisible);
  const blocked = visible.filter((item) =>
    item.dependsOn.some((dependencyId) => itemsById.get(dependencyId)?.status !== "done"),
  );
  return {
    total: normalized.length,
    items: visible.filter((item) => !blocked.includes(item)).slice(0, limit),
    blocked,
  };
}
`;

const partialWorkQueue = `import { blockingDependencies, isQueueVisible } from "./eligibility.mjs";
import { normalizeWorkItem } from "./normalize-work-item.mjs";

export function buildWorkQueue(workItems, { limit = Infinity } = {}) {
  const normalized = workItems.map(normalizeWorkItem);
  const visible = normalized.filter(isQueueVisible);
  const blocked = visible.filter((item) => blockingDependencies(item, normalized).length > 0);
  const items = visible.slice(0, limit).filter((item) => blockingDependencies(item, normalized).length === 0);
  return {
    total: normalized.length,
    items,
    blocked,
  };
}
`;

const goodMergeSettings = `function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
  }
  return value;
}

function mergeRecords(base, override) {
  const result = cloneValue(base);
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isRecord(result[key]) && isRecord(value)) {
      result[key] = mergeRecords(result[key], value);
    } else {
      result[key] = cloneValue(value);
    }
  }
  return result;
}

export function mergeSettings(...layers) {
  return layers.reduce((settings, layer) => mergeRecords(settings, layer), {});
}
`;

const partialMergeSettings = `function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeRecords(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (isRecord(result[key]) && isRecord(value)) {
      result[key] = { ...result[key], ...value };
    } else if (Array.isArray(value)) {
      result[key] = [...value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function mergeSettings(...layers) {
  return layers.reduce((settings, layer) => mergeRecords(settings, layer), {});
}
`;

const implementationRegression = `
test("reports dependency-blocked work", () => {
  const result = buildWorkQueue([
    { id: "blocked", title: "Blocked", dependsOn: ["open"] },
    { id: "open", title: "Open" },
    { id: "missing", title: "Missing", dependsOn: ["unknown"] },
    { id: "finished", title: "Finished", status: "done" },
  ], { limit: 10 });

  assert.deepEqual(result.items.map(({ id }) => id), ["open"]);
  assert.deepEqual(result.blocked.map(({ id }) => id), ["blocked", "missing"]);
});
`;

const implementationStrongRegression = `
test("separates blocked work without spending actionable limit", () => {
  const input = [
    { id: "waiting", title: "Waiting", dependsOn: ["open"] },
    { id: "open", title: "Open" },
    { id: "ready", title: "Ready", dependsOn: ["finished"] },
    { id: "finished", title: "Finished", status: "done" },
    { id: "missing", title: "Missing", dependsOn: ["unknown"] },
    { id: "archived", title: "Archived", status: "archived", dependsOn: ["unknown"] },
  ];
  const result = buildWorkQueue(input, { limit: 1 });

  assert.deepEqual(result.items.map(({ id }) => id), ["open"]);
  assert.deepEqual(result.blocked.map(({ id }) => id), ["waiting", "missing"]);
  assert.equal(result.total, input.length);
  assert.deepEqual(input[0].dependsOn, ["open"]);
  assert.deepEqual(buildWorkQueue(input, { limit: 10 }).items.map(({ id }) => id), ["open", "ready"]);
});
`;

const diagnosisRegression = `
test("keeps workspace settings isolated when switching workspaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "phase2-settings-regression-"));
  const first = join(root, "first");
  const second = join(root, "second");
  await mkdir(first, { recursive: true });
  await mkdir(second, { recursive: true });
  await writeFile(join(first, "settings.json"), JSON.stringify({
    display: {
      color: "always",
      markers: { pending: "!", complete: "done" },
    },
    execution: { retries: 5, tags: ["first"] },
  }));
  await writeFile(join(second, "settings.json"), JSON.stringify({
    display: { columns: ["name"] },
  }));

  assert.equal(readWorkspaceStatus(first).color, "always");
  assert.deepEqual(readWorkspaceStatus(second), {
    color: "auto",
    columns: ["name"],
    markers: { pending: "…", complete: "✓" },
    retries: 2,
    tags: [],
  });
});
`;

async function writeImplementationSource(repository, eligibility, workQueue) {
  const root = join(repository, implementationRoot, "src");
  await writeFile(join(root, "eligibility.mjs"), eligibility);
  await writeFile(join(root, "work-queue.mjs"), workQueue);
}

async function writeDiagnosisSource(repository, mergeSettings) {
  await writeFile(join(repository, diagnosisRoot, "src", "merge-settings.mjs"), mergeSettings);
}

test("Phase 2 manifest is exactly two scenarios by Luna max and Terra medium", async () => {
  const manifest = parseManifest(
    JSON.parse(await readFile(join(fixtureDirectory, "manifest.json"), "utf8")),
    fixtureDirectory,
  );
  const matrix = expandMatrix(manifest).map(({ scenario, profile }) => ({
    scenario: scenario.id,
    profile: profile.id,
    model: profile.model,
    thinking: profile.thinking,
    tools: profile.execution?.tools,
    package: profile.package,
  }));

  assert.equal(matrix.length, 4);
  assert.deepEqual([...new Set(matrix.map(({ scenario }) => scenario))], [
    "medium-multi-file-implementation",
    "non-local-diagnosis",
  ]);
  assert.deepEqual([...new Set(matrix.map(({ profile }) => profile))], ["luna-max", "terra-medium"]);
  assert.deepEqual(matrix.map(({ scenario, profile, model, thinking }) => ({ scenario, profile, model, thinking })), [
    { scenario: "medium-multi-file-implementation", profile: "luna-max", model: "openai-codex/gpt-5.6-luna", thinking: "max" },
    { scenario: "medium-multi-file-implementation", profile: "terra-medium", model: "openai-codex/gpt-5.6-terra", thinking: "medium" },
    { scenario: "non-local-diagnosis", profile: "luna-max", model: "openai-codex/gpt-5.6-luna", thinking: "max" },
    { scenario: "non-local-diagnosis", profile: "terra-medium", model: "openai-codex/gpt-5.6-terra", thinking: "medium" },
  ]);
  for (const run of matrix) {
    assert.deepEqual(run.tools, ["read", "bash", "edit", "write", "grep", "find", "ls"]);
    assert.equal(run.package, undefined);
  }
});

test("implementation verifier rejects baseline, incomplete, and comment-only coverage, then accepts multi-module and cohesive local fixes", async () => {
  const untouched = await fixtureRepository();
  await assert.rejects(verify(untouched, "implementation"));

  const incomplete = await fixtureRepository();
  await writeImplementationSource(incomplete, goodEligibility, partialWorkQueue);
  await writeFile(
    join(incomplete, implementationRoot, implementationTest),
    `${await readFile(join(incomplete, implementationRoot, implementationTest), "utf8")}${implementationRegression}`,
  );
  await assert.rejects(verify(incomplete, "implementation"), /actionable limit/);

  const commentOnly = await fixtureRepository();
  await writeImplementationSource(commentOnly, goodEligibility, goodWorkQueue);
  await writeFile(
    join(commentOnly, implementationRoot, implementationTest),
    `${await readFile(join(commentOnly, implementationRoot, implementationTest), "utf8")}\n// Coverage note only; no executable regression was added.\n`,
  );
  await assert.rejects(verify(commentOnly, "implementation"));

  const cohesive = await fixtureRepository();
  await writeFile(
    join(cohesive, implementationRoot, "src", "work-queue.mjs"),
    cohesiveWorkQueue,
  );
  await writeFile(
    join(cohesive, implementationRoot, implementationTest),
    `${await readFile(join(cohesive, implementationRoot, implementationTest), "utf8")}${implementationStrongRegression}`,
  );
  await assert.doesNotReject(verify(cohesive, "implementation"));

  const good = await fixtureRepository();
  await writeImplementationSource(good, goodEligibility, goodWorkQueue);
  await writeFile(
    join(good, implementationRoot, implementationTest),
    `${await readFile(join(good, implementationRoot, implementationTest), "utf8")}${implementationStrongRegression}`,
  );
  await assert.doesNotReject(verify(good, "implementation"));
});

test("diagnosis verifier rejects baseline, partial root fixes, and comment-only coverage, then accepts a real regression fix", async () => {
  const untouched = await fixtureRepository();
  await assert.rejects(verify(untouched, "diagnosis"));

  const incomplete = await fixtureRepository();
  await writeDiagnosisSource(incomplete, partialMergeSettings);
  await writeFile(
    join(incomplete, diagnosisRoot, diagnosisTest),
    `${await readFile(join(incomplete, diagnosisRoot, diagnosisTest), "utf8")}${diagnosisRegression}`,
  );
  await assert.rejects(verify(incomplete, "diagnosis"));

  const commentOnly = await fixtureRepository();
  await writeDiagnosisSource(commentOnly, goodMergeSettings);
  await writeFile(
    join(commentOnly, diagnosisRoot, diagnosisTest),
    `${await readFile(join(commentOnly, diagnosisRoot, diagnosisTest), "utf8")}\n// The diagnosis was documented; no executable regression was added.\n`,
  );
  await assert.rejects(verify(commentOnly, "diagnosis"));

  const good = await fixtureRepository();
  await writeDiagnosisSource(good, goodMergeSettings);
  await writeFile(
    join(good, diagnosisRoot, diagnosisTest),
    `${await readFile(join(good, diagnosisRoot, diagnosisTest), "utf8")}${diagnosisRegression}`,
  );
  await assert.doesNotReject(verify(good, "diagnosis"));
});
