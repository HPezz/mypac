import test from "node:test";
import assert from "node:assert/strict";
import { fetchTaskIssue, listReadyTasks, moveTaskState, resolveCurrentGitLabRepository } from "./gitlab.ts";

const repository = { provider: "gitlab", host: "gitlab.com", project: "picto-access/picto-api" };

test("resolves the current GitLab repository through glab rather than SSH host aliases", async () => {
	const calls = [];
	const pi = { async exec(command, args, options) {
		calls.push([command, args, options]);
		return { code: 0, stderr: "", stdout: JSON.stringify({
			path_with_namespace: "picto-access/picto-api",
			web_url: "https://gitlab.com/picto-access/picto-api",
		}) };
	} };
	assert.deepEqual(await resolveCurrentGitLabRepository(pi, "/workspace/picto-api"), { ok: true, value: repository });
	assert.deepEqual(calls, [["glab", ["repo", "view", "--output", "json"], { cwd: "/workspace/picto-api", timeout: 30_000 }]]);
});

test("fetches a task issue with one structured glab read", async () => {
	const calls = [];
	const pi = { async exec(command, args, options) {
		calls.push([command, args, options]);
		return { code: 0, stderr: "", stdout: JSON.stringify({
			iid: 42,
			title: "Task",
			description: "## Summary\n\nWork",
			state: "opened",
			labels: ["State::To Do", "pac:ready_for_agent"],
			assignees: [{ username: "HPezz" }],
			web_url: "https://gitlab.com/picto-access/picto-api/-/work_items/42",
			updated_at: "2026-11-05T10:00:00Z",
		}) };
	} };

	const result = await fetchTaskIssue(pi, repository, 42);
	assert.equal(result.ok, true);
	assert.equal(result.value.title, "Task");
	assert.deepEqual(result.value.assignees, ["HPezz"]);
	assert.deepEqual(calls, [[
		"glab",
		["issue", "view", "42", "--repo", "https://gitlab.com/picto-access/picto-api", "--output", "json"],
		{ timeout: 30_000 },
	]]);
});

test("lists ready tasks across the repository group", async () => {
	const calls = [];
	const pi = { async exec(command, args) {
		calls.push([command, args]);
		return { code: 0, stderr: "", stdout: JSON.stringify([
			{ iid: 8, title: "Ready", state: "opened", labels: ["pac:ready_for_agent", "pac:afk"], assignees: [], web_url: "https://gitlab.com/picto-access/picto-admin/-/work_items/8", updated_at: "2026-11-05T10:00:00Z", description: "" },
		]) };
	} };

	const result = await listReadyTasks(pi, repository);
	assert.equal(result.ok, true);
	assert.equal(result.value[0].iid, 8);
	assert.deepEqual(calls[0], ["glab", ["api", "--hostname", "gitlab.com", "groups/picto-access/issues?state=opened&labels=pac%3Aready_for_agent&per_page=100"]]);
});

test("moves workflow state by removing other State labels and adding the target", async () => {
	const calls = [];
	const pi = { async exec(command, args) {
		calls.push([command, args]);
		if (args[0] === "api") {
			return { code: 0, stdout: JSON.stringify([{ name: "State::Doing" }]), stderr: "" };
		}
		return { code: 0, stdout: "", stderr: "" };
	} };
	const issue = {
		iid: 42, title: "Task", description: "", state: "opened",
		labels: ["State::To Do", "pac:ready_for_agent"], assignees: [],
		webUrl: "https://gitlab.com/picto-access/picto-api/-/work_items/42", updatedAt: "2026-11-05T10:00:00Z",
	};

	const result = await moveTaskState(pi, repository, issue, "doing");
	assert.equal(result.ok, true);
	assert.deepEqual(calls, [
		["glab", ["api", "--hostname", "gitlab.com", "projects/picto-access%2Fpicto-api/labels?include_ancestor_groups=true&per_page=100"]],
		["glab", [
			"issue", "update", "42", "--repo", "https://gitlab.com/picto-access/picto-api",
			"--unlabel", "State::To Do", "--label", "State::Doing",
		]],
	]);
});
