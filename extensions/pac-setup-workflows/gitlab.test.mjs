import test from "node:test";
import assert from "node:assert/strict";
import { fetchGitLabLabels, parseGitLabLabels, renameGitLabLabel, updateGitLabLabel } from "./gitlab.ts";

const repository = { provider: "gitlab", host: "git.example.com", project: "group/subgroup/app" };

test("parses project and inherited GitLab labels", () => {
	assert.deepEqual(parseGitLabLabels(JSON.stringify([
		{ id: 1, name: "pac:prd", color: "#BFDADC", description: "project", is_project_label: true },
		{ id: 2, name: "pac:adr", color: "#D4C5F9", description: "group", is_project_label: false },
	])), [
		{ id: 1, name: "pac:prd", color: "#BFDADC", description: "project", scope: "project" },
		{ id: 2, name: "pac:adr", color: "#D4C5F9", description: "group", scope: "group" },
	]);
});

test("fetches labels including ancestor groups from self-hosted nested projects", async () => {
	const calls = [];
	const pi = { async exec(command, args) {
		calls.push([command, args]);
		return { code: 0, stdout: "[]", stderr: "" };
	} };

	assert.deepEqual(await fetchGitLabLabels(pi, repository), { ok: true, value: [] });
	assert.deepEqual(calls, [["glab", [
		"api", "--hostname", "git.example.com", "--paginate",
		"projects/group%2Fsubgroup%2Fapp/labels?include_ancestor_groups=true&per_page=100",
	]]]);
});

test("never mutates inherited group labels", async () => {
	const pi = { async exec() { throw new Error("must not execute"); } };
	const inherited = { id: 2, name: "prd", color: "#000000", scope: "group" };
	const expected = { name: "pac:prd", color: "BFDADC", description: "PRD" };

	assert.deepEqual(await renameGitLabLabel(pi, repository, inherited, expected), {
		action: "rename", label: "prd", target: "pac:prd", success: false, message: "inherited group labels are read-only",
	});
	assert.deepEqual(await updateGitLabLabel(pi, repository, inherited, expected), {
		action: "update", label: "prd", success: false, message: "inherited group labels are read-only",
	});
});
