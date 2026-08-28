import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const resultPath = "evaluations/phase1-model-comparison/workspace/routing-decision.json";
const decision = JSON.parse(await readFile(resultPath, "utf8"));
assert.deepEqual(decision, {
  decision: "stop",
  implementationRequired: false,
  nextWorkflow: null,
  evidence: "release-record:completed",
});
assert.equal(
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }),
  `?? ${resultPath}\n`,
  "the decision artifact must be the only repository change",
);
