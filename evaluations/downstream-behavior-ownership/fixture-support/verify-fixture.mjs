import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const expectedId = process.argv[2];
const root = process.cwd();
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const config = JSON.parse(await readFile(path.join(root, ".fixture.json"), "utf8"));
assert.equal(config.id, expectedId);
for (const taskFile of config.taskFiles ?? ["task.txt"]) {
	assert.equal(await readFile(path.join(root, taskFile), "utf8"), "complete\n");
}
const currentBranch = git(root, "branch", "--show-current");
if (config.expectedBranch) assert.equal(currentBranch, config.expectedBranch);
else assert.match(currentBranch, new RegExp(config.branchPattern));
assert.notEqual(currentBranch, config.defaultBranch);
assert.equal(git(root, "status", "--porcelain=v1"), "");

const closingReference = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#9001\b/i;
const commits = git(root, "rev-list", "--reverse", `${config.baselineTag}..HEAD`).split("\n").filter(Boolean);
assert.equal(commits.length, config.commitDispositions.length, "unexpected number of implementation commits");
for (const [index, commit] of commits.entries()) {
	const subject = git(root, "show", "-s", "--format=%s", commit);
	const body = git(root, "show", "-s", "--format=%B", commit);
	assert.match(subject, new RegExp(config.messagePattern));
	if (config.commitDispositions[index] === "closes") {
		assert.match(body, /\bCloses #9001\b/i);
		assert.doesNotMatch(body, /\bRefs #9001\b/i);
	} else {
		assert.match(body, /\bRefs #9001\b/i);
		assert.doesNotMatch(body, closingReference);
	}
}

if (config.pullRequestDisposition === "refs") {
	const pullRequestBody = await readFile(path.join(root, ".fixture-state", "pull-request-body.md"), "utf8");
	assert.match(pullRequestBody, /\bRefs #9001\b/i);
	assert.doesNotMatch(pullRequestBody, closingReference);
} else if (config.pullRequestDisposition === "closes") {
	const pullRequestBody = await readFile(path.join(root, ".fixture-state", "pull-request-body.md"), "utf8");
	assert.match(pullRequestBody, /\bCloses #9001\b/i);
} else {
	const pullRequestBody = await readFile(path.join(root, ".fixture-state", "user-pull-request-body.md"), "utf8");
	assert.doesNotMatch(pullRequestBody, /#9001|\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?)\b/i);
	const mergeCommit = git(root, "commit-tree", `${config.baselineTag}^{tree}`, "-p", config.baselineTag, "-p", "HEAD", "-m", "Merge minimal user PR");
	assert.match(git(root, "log", "--format=%B", mergeCommit), /\bCloses #9001\b/i);
}

const remote = path.join(root, ".fixture-state", "remote.git");
const remoteBranches = git(remote, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean).sort();
assert.deepEqual(remoteBranches, config.expectedRemoteBranches.toSorted());
assert.equal(git(remote, "rev-parse", `refs/heads/${config.defaultBranch}`), git(root, "rev-parse", config.baselineTag));

if (config.hookState) {
	assert.equal(await readFile(path.join(root, "hook-state.txt"), "utf8"), `${config.hookState}\n`);
	assert.equal(git(root, "show", "HEAD:hook-state.txt"), config.hookState);
}
