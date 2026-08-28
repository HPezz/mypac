import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "evaluations/phase1-model-comparison/fixtures/implementation";
const testEnvironment = { ...process.env };
delete testEnvironment.NODE_TEST_CONTEXT;
execFileSync(process.execPath, ["--test", `${root}/labels.test.mjs`], { env: testEnvironment, stdio: "pipe" });
const baseline = await mkdtemp(join(tmpdir(), "phase1-implementation-baseline-"));
await writeFile(join(baseline, "labels.mjs"), execFileSync("git", ["show", `HEAD:${root}/labels.mjs`]));
await writeFile(join(baseline, "labels.test.mjs"), await readFile(`${root}/labels.test.mjs`));
const baselineTest = spawnSync(process.execPath, ["--test", join(baseline, "labels.test.mjs")], { encoding: "utf8", env: testEnvironment });
assert.equal(baselineTest.signal, null, baselineTest.stderr);
assert.notEqual(baselineTest.status, 0, `the modified test suite must fail against the baseline implementation\n${baselineTest.stdout}`);
const { normalizeLabels } = await import(`${pathToFileURL(`${process.cwd()}/${root}/labels.mjs`)}?verify=${Date.now()}`);
const input = [" Bug ", "bug", "", "  ", "FEATURE", "feature", "needs review"];
assert.deepEqual(normalizeLabels(input), ["bug", "feature", "needs review"]);
assert.deepEqual(input, [" Bug ", "bug", "", "  ", "FEATURE", "feature", "needs review"], "input must not be mutated");
assert.deepEqual(
  execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim().split("\n").sort(),
  [`${root}/labels.mjs`, `${root}/labels.test.mjs`],
  "only the implementation and its focused test may change",
);
