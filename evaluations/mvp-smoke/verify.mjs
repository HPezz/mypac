import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const resultPath = "evaluations/mvp-smoke/workspace/result.txt";
const expected = "Pi evaluation harness smoke passed.\n";

assert.equal(await readFile(resultPath, "utf8"), expected, `${resultPath} must contain the exact requested line`);
assert.equal(
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }),
  `?? ${resultPath}\n`,
  "the requested result must be the only repository change",
);
