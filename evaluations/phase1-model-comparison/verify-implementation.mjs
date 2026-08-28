import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = "evaluations/phase1-model-comparison/fixtures/implementation";
execFileSync(process.execPath, ["--test", `${root}/labels.test.mjs`], { stdio: "pipe" });
const { normalizeLabels } = await import(`${pathToFileURL(`${process.cwd()}/${root}/labels.mjs`)}?verify=${Date.now()}`);
const input = [" Bug ", "bug", "", "  ", "FEATURE", "feature", "needs review"];
assert.deepEqual(normalizeLabels(input), ["bug", "feature", "needs review"]);
assert.deepEqual(input, [" Bug ", "bug", "", "  ", "FEATURE", "feature", "needs review"], "input must not be mutated");
assert.deepEqual(
  execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim().split("\n").sort(),
  [`${root}/labels.mjs`, `${root}/labels.test.mjs`],
  "only the implementation and its focused test may change",
);
