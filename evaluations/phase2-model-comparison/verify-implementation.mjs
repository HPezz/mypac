import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "evaluations/phase2-model-comparison/fixtures/implementation";
const sourceFiles = [
  "src/eligibility.mjs",
  "src/index.mjs",
  "src/normalize-work-item.mjs",
  "src/work-queue.mjs",
];
const testFile = "test/work-queue.test.mjs";
const allowedFiles = new Set([...sourceFiles, testFile]);
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
  const directory = await mkdtemp(join(tmpdir(), "phase2-implementation-baseline-"));
  await writeSources(directory);
  const destination = join(directory, testFile);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, testContents);
  return directory;
}

async function candidateCheckout(testContents) {
  const directory = await mkdtemp(join(tmpdir(), "phase2-implementation-candidate-"));
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
assertTestsPass(runTests(process.cwd(), currentTest), "the focused implementation tests");

const baseline = await baselineCheckout(await readFile(currentTest));
assertTestsFail(
  runTests(baseline, join(baseline, testFile)),
  "the modified focused test suite against the baseline implementation",
);

const preserved = await candidateCheckout(
  execFileSync("git", ["show", `HEAD:${root}/${testFile}`]),
);
assertTestsPass(
  runTests(preserved, join(preserved, testFile)),
  "the original focused tests against the candidate implementation",
);

const moduleUrl = pathToFileURL(join(process.cwd(), root, "src/index.mjs")).href;
const { buildWorkQueue } = await import(`${moduleUrl}?verify=${Date.now()}`);
const input = [
  { id: "waiting", title: "Waiting", dependsOn: ["open"] },
  { id: "open", title: "Open" },
  { id: "ready", title: "Ready", dependsOn: ["finished"] },
  { id: "finished", title: "Finished", status: "done" },
  { id: "missing", title: "Missing", dependsOn: ["not-present"] },
  { id: "archived", title: "Archived", status: "archived", dependsOn: ["not-present"] },
  { id: "done", title: "Done", status: "done", dependsOn: ["not-present"] },
];
const inputSnapshot = structuredClone(input);
const limited = buildWorkQueue(input, { limit: 1 });
assert.equal(limited.total, input.length);
assert.deepEqual(
  limited.items.map(({ id }) => id),
  ["open"],
  "blocked items must not consume the actionable limit",
);
assert.deepEqual(limited.blocked.map(({ id }) => id), ["waiting", "missing"]);
assert.deepEqual(input, inputSnapshot, "queue construction must not mutate input");

const unlimited = buildWorkQueue(input, { limit: 10 });
assert.deepEqual(unlimited.items.map(({ id }) => id), ["open", "ready"]);
assert.deepEqual(unlimited.blocked.map(({ id }) => id), ["waiting", "missing"]);
assert.deepEqual(buildWorkQueue(input, { limit: 0 }).items, []);

const files = changedFiles();
assert(files.includes(testFile), "the candidate must add or update focused regression coverage");
assert(files.every((file) => allowedFiles.has(file)), `unexpected files changed: ${files.join(", ")}`);
