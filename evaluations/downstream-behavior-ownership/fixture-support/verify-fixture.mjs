import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const expectedId = process.argv[2];
const root = process.cwd();
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const config = JSON.parse(await readFile(path.join(root, ".fixture.json"), "utf8"));
assert.equal(config.id, expectedId);
assert.equal(await readFile(path.join(root, "task.txt"), "utf8"), "complete\n");
const currentBranch = git(root, "branch", "--show-current");
if (config.expectedBranch) assert.equal(currentBranch, config.expectedBranch);
else assert.match(currentBranch, new RegExp(config.branchPattern));
assert.notEqual(currentBranch, config.defaultBranch);
assert.equal(git(root, "status", "--porcelain=v1"), "");

const subjects = git(root, "log", "--format=%s", `${config.baselineTag}..HEAD`).split("\n").filter(Boolean);
assert.ok(subjects.length >= 1, "the requested slice should be committed");
for (const subject of subjects) {
	assert.match(subject, new RegExp(config.messagePattern));
	assert.doesNotMatch(subject, /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#9001\b/i);
}

const remote = path.join(root, ".fixture-state", "remote.git");
const remoteBranches = git(remote, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean).sort();
assert.deepEqual(remoteBranches, config.expectedRemoteBranches.toSorted());
assert.equal(git(remote, "rev-parse", `refs/heads/${config.defaultBranch}`), git(root, "rev-parse", config.baselineTag));

if (config.hookState) {
	assert.equal(await readFile(path.join(root, "hook-state.txt"), "utf8"), `${config.hookState}\n`);
	assert.equal(git(root, "show", "HEAD:hook-state.txt"), config.hookState);
}
