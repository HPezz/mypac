import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "evaluations/phase2-model-comparison/fixtures/diagnosis";
const sourceFiles = [
  "src/default-settings.mjs",
  "src/load-workspace-settings.mjs",
  "src/merge-settings.mjs",
  "src/status-report.mjs",
];
const testFile = "test/settings.test.mjs";
const allowedFiles = new Set(["src/merge-settings.mjs", testFile]);
const testEnvironment = { ...process.env };
delete testEnvironment.NODE_TEST_CONTEXT;

function runTests(directory, testPath) {
  return spawnSync(process.execPath, ["--test", testPath], {
    cwd: directory,
    encoding: "utf8",
    env: testEnvironment,
  });
}

function assertTestsPass(result, description) {
  assert.equal(result.signal, null, `${description} terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${description} failed\n${result.stdout}\n${result.stderr}`);
}

function assertTestsFail(result, description) {
  assert.equal(result.signal, null, `${description} terminated by ${result.signal}`);
  assert.notEqual(result.status, 0, `${description} unexpectedly passed`);
}

async function writeSources(directory, files) {
  for (const file of sourceFiles) {
    const destination = join(directory, file);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, files?.[file] ?? execFileSync("git", ["show", `HEAD:${root}/${file}`]));
  }
}

async function baselineCheckout(testContents) {
  const directory = await mkdtemp(join(tmpdir(), "phase2-diagnosis-baseline-"));
  await writeSources(directory);
  const destination = join(directory, testFile);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, testContents);
  return directory;
}

async function candidateCheckout(testContents) {
  const directory = await mkdtemp(join(tmpdir(), "phase2-diagnosis-candidate-"));
  const files = Object.fromEntries(await Promise.all(
    sourceFiles.map(async (file) => [file, await readFile(join(process.cwd(), root, file))]),
  ));
  await writeSources(directory, files);
  const destination = join(directory, testFile);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, testContents);
  return directory;
}

function changedFiles() {
  const tracked = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim();
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).trim();
  return [...new Set([tracked, untracked]
    .flatMap((value) => value ? value.split("\n") : [])
    .map((file) => file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file))].sort();
}

const currentTest = join(process.cwd(), root, testFile);
assertTestsPass(runTests(process.cwd(), currentTest), "the focused diagnosis tests");
assert.equal(execFileSync(process.execPath, [`${root}/repro.mjs`], { encoding: "utf8" }).trim(), "repro passed");

const baseline = await baselineCheckout(await readFile(currentTest));
assertTestsFail(
  runTests(baseline, join(baseline, testFile)),
  "the modified focused test suite against the baseline diagnosis source",
);

const preserved = await candidateCheckout(
  execFileSync("git", ["show", `HEAD:${root}/${testFile}`]),
);
assertTestsPass(
  runTests(preserved, join(preserved, testFile)),
  "the original focused tests against the candidate diagnosis source",
);

const settingsUrl = pathToFileURL(join(process.cwd(), root, "src/load-workspace-settings.mjs")).href;
const mergeUrl = pathToFileURL(join(process.cwd(), root, "src/merge-settings.mjs")).href;
const defaultsUrl = pathToFileURL(join(process.cwd(), root, "src/default-settings.mjs")).href;
const { loadWorkspaceSettings } = await import(`${settingsUrl}?verify=${Date.now()}`);
const { mergeSettings } = await import(`${mergeUrl}?verify=${Date.now()}`);
const { DEFAULT_SETTINGS } = await import(defaultsUrl);

const rootDirectory = await mkdtemp(join(tmpdir(), "phase2-settings-hidden-"));
const first = join(rootDirectory, "first");
const second = join(rootDirectory, "second");
const third = join(rootDirectory, "third");
for (const directory of [first, second, third]) await mkdir(directory, { recursive: true });
await writeFile(join(first, "settings.json"), JSON.stringify({
  display: { markers: { pending: "!" } },
  execution: { tags: ["first"] },
}));
await writeFile(join(second, "settings.json"), JSON.stringify({
  display: { columns: ["name"] },
}));
await writeFile(join(third, "settings.json"), "{}\n");

const defaultsBefore = structuredClone(DEFAULT_SETTINGS);
assert.deepEqual(loadWorkspaceSettings(first), {
  display: {
    color: "auto",
    columns: ["name", "status"],
    markers: { pending: "!", complete: "✓" },
  },
  execution: { retries: 2, tags: ["first"] },
});
assert.deepEqual(loadWorkspaceSettings(second), {
  display: {
    color: "auto",
    columns: ["name"],
    markers: { pending: "…", complete: "✓" },
  },
  execution: { retries: 2, tags: [] },
});
assert.deepEqual(loadWorkspaceSettings(third), defaultsBefore);
assert.deepEqual(DEFAULT_SETTINGS, defaultsBefore, "loading settings must not mutate shared defaults");

const base = { nested: { keep: { first: 1, second: 2 } }, values: ["base"] };
const merged = mergeSettings(base, { nested: { keep: { first: 3 } }, values: ["override"] });
assert.deepEqual(merged, { nested: { keep: { first: 3, second: 2 } }, values: ["override"] });
assert.deepEqual(base, { nested: { keep: { first: 1, second: 2 } }, values: ["base"] }, "merge must not mutate inputs");

const files = changedFiles();
assert.deepEqual(files, [...allowedFiles].sort(), `only the root-cause source and focused test may change: ${files.join(", ")}`);
