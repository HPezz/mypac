import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "evaluations/phase1-model-comparison/fixtures/diagnosis";
const testEnvironment = { ...process.env };
delete testEnvironment.NODE_TEST_CONTEXT;
execFileSync(process.execPath, [`${root}/repro.mjs`], { stdio: "pipe" });
execFileSync(process.execPath, ["--test", `${root}/config-cache.test.mjs`], { env: testEnvironment, stdio: "pipe" });
const baseline = await mkdtemp(join(tmpdir(), "phase1-diagnosis-baseline-"));
await writeFile(join(baseline, "config-cache.mjs"), execFileSync("git", ["show", `HEAD:${root}/config-cache.mjs`]));
await writeFile(join(baseline, "config-cache.test.mjs"), await readFile(`${root}/config-cache.test.mjs`));
const baselineTest = spawnSync(process.execPath, ["--test", join(baseline, "config-cache.test.mjs")], { encoding: "utf8", env: testEnvironment });
assert.equal(baselineTest.signal, null, baselineTest.stderr);
assert.notEqual(baselineTest.status, 0, `the modified test suite must fail against the baseline implementation\n${baselineTest.stdout}`);
const { clearConfigCache, loadConfig } = await import(`${pathToFileURL(`${process.cwd()}/${root}/config-cache.mjs`)}?verify=${Date.now()}`);
clearConfigCache();
const temporary = await mkdtemp(join(tmpdir(), "config-cache-verify-"));
const expected = [];
for (const [parent, owner] of [["north", "alpha"], ["south", "beta"], ["west", "gamma"]]) {
  const directory = join(temporary, parent, "service");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config.json"), JSON.stringify({ owner }));
  expected.push([directory, owner]);
}
for (const [directory, owner] of expected) {
  assert.deepEqual(loadConfig(directory), { owner });
}
const [firstDirectory] = expected[0];
const firstValue = loadConfig(firstDirectory);
await writeFile(join(firstDirectory, "config.json"), JSON.stringify({ owner: "changed" }));
assert.equal(loadConfig(firstDirectory), firstValue, "the cache must still reuse values for the same directory");
assert.deepEqual(
  execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim().split("\n").sort(),
  [`${root}/config-cache.mjs`, `${root}/config-cache.test.mjs`],
  "only the root-cause fix and its focused test may change",
);
