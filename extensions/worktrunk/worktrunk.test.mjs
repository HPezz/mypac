import test from "node:test";
import assert from "node:assert/strict";
import {
	buildIssueBranch,
	findWorktreeByBranch,
	formatIssueWorktreeSummary,
	parseIssueTarget,
	parseWorktrunkList,
	slugifyIssueTitle,
} from "./helpers.ts";
import { ensureWorktree } from "./index.ts";

test("parses a local issue number", () => {
	assert.deepEqual(parseIssueTarget("85"), { kind: "number", number: 85 });
});

test("parses a GitHub issue URL", () => {
	assert.deepEqual(parseIssueTarget("https://github.com/ladislas/mypac/issues/85"), {
		kind: "url",
		owner: "ladislas",
		repo: "mypac",
		number: 85,
	});
});

test("rejects invalid issue targets", () => {
	assert.equal(parseIssueTarget(""), null);
	assert.equal(parseIssueTarget("not-an-issue"), null);
	assert.equal(parseIssueTarget("https://example.com/ladislas/mypac/issues/85"), null);
	assert.equal(parseIssueTarget("https://github.com/ladislas/mypac/pull/85"), null);
});

test("slugifies issue titles", () => {
	assert.equal(slugifyIssueTitle("Adopt a Worktrunk-backed workflow for parallel Pi issue work"), "adopt-a-worktrunk-backed-workflow-for-parallel-pi-issue-work");
	assert.equal(slugifyIssueTitle("Fix: mise + npm setup!"), "fix-mise-npm-setup");
});

test("builds repo-convention issue branch names", () => {
	assert.equal(
		buildIssueBranch(85, "Adopt a Worktrunk-backed workflow"),
		"ladislas/feature/85-adopt-a-worktrunk-backed-workflow",
	);
});

test("parses Worktrunk list output", () => {
	const entries = parseWorktrunkList(`\n${JSON.stringify([
		{ branch: "main", path: "/repo", is_current: true },
		{ branch: "ladislas/feature/85-work", path: "/repo/.worktrees/85-work" },
	])}\n`);

	assert.deepEqual(entries, [
		{ branch: "main", path: "/repo" },
		{ branch: "ladislas/feature/85-work", path: "/repo/.worktrees/85-work" },
	]);
	assert.deepEqual(findWorktreeByBranch(entries, "ladislas/feature/85-work"), {
		branch: "ladislas/feature/85-work",
		path: "/repo/.worktrees/85-work",
	});
});

test("reports an existing Worktrunk entry without a path before trying to create", async () => {
	const calls = [];
	const pi = {
		async exec(command, args) {
			calls.push([command, args]);
			assert.deepEqual([command, args], ["wt", ["list", "--format=json"]]);
			return {
				code: 0,
				stdout: JSON.stringify([{ branch: "ladislas/feature/85-work" }]),
				stderr: "",
			};
		},
	};

	const result = await ensureWorktree(pi, "ladislas/feature/85-work");

	assert.deepEqual(result, {
		ok: false,
		error: "Worktree for ladislas/feature/85-work exists but has no path in wt list output.",
	});
	assert.equal(calls.length, 1);
});

test("formats next Pi command with shell quoting", () => {
	assert.equal(
		formatIssueWorktreeSummary({
			created: true,
			issueNumber: 85,
			issueTitle: "Adopt Worktrunk",
			branch: "ladislas/feature/85-adopt-worktrunk",
			path: "/tmp/my worktree",
		}),
		[
			"Created worktree for #85: Adopt Worktrunk",
			"Branch: ladislas/feature/85-adopt-worktrunk",
			"Path: /tmp/my worktree",
			"",
			"Next:",
			"cd '/tmp/my worktree' && pi",
		].join("\n"),
	);
});
