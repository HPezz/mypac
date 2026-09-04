import test from "node:test";
import assert from "node:assert/strict";
import { parseForgeReference, resolveForgeRepository } from "./forge.ts";

test("parses GitHub and nested GitLab issue and change-request URLs", () => {
	assert.deepEqual(parseForgeReference("https://github.com/acme/widget/issues/12"), {
		provider: "github",
		host: "github.com",
		project: "acme/widget",
		kind: "issue",
		number: 12,
		url: "https://github.com/acme/widget/issues/12",
	});
	assert.deepEqual(parseForgeReference("https://git.example.com/platform/apps/widget/-/merge_requests/34#note_1"), {
		provider: "gitlab",
		host: "git.example.com",
		project: "platform/apps/widget",
		kind: "change",
		number: 34,
		url: "https://git.example.com/platform/apps/widget/-/merge_requests/34",
	});
});

test("explicit forge URL wins without reading git remotes", async () => {
	const calls = [];
	const result = await resolveForgeRepository(async (command, args) => {
		calls.push([command, args]);
		throw new Error("resolver should not execute commands");
	}, { explicitUrl: "https://gitlab.com/group/subgroup/project/-/issues/9" });

	assert.deepEqual(result, {
		ok: true,
		value: { provider: "gitlab", host: "gitlab.com", project: "group/subgroup/project" },
	});
	assert.deepEqual(calls, []);
});

test("tracking remote wins over origin and supports configured self-hosted GitLab", async () => {
	const calls = [];
	const result = await resolveForgeRepository(async (command, args) => {
		calls.push([command, args]);
		const key = `${command} ${args.join(" ")}`;
		if (key === "git branch --show-current") return { code: 0, stdout: "feature/x\n", stderr: "" };
		if (key === "git config --get branch.feature/x.remote") return { code: 0, stdout: "company\n", stderr: "" };
		if (key === "git remote get-url company") return { code: 0, stdout: "git@git.example.com:platform/apps/widget.git\n", stderr: "" };
		if (key === "glab auth status --hostname git.example.com") return { code: 0, stdout: "", stderr: "" };
		if (key === "gh auth status --hostname git.example.com") return { code: 1, stdout: "", stderr: "not configured" };
		throw new Error(`unexpected command: ${key}`);
	});

	assert.deepEqual(result, {
		ok: true,
		value: {
			provider: "gitlab",
			host: "git.example.com",
			project: "platform/apps/widget",
			remote: "company",
		},
	});
	assert.equal(calls.some(([command, args]) => command === "git" && args.at(-1) === "origin"), false);
});

test("origin is used when the current branch has no tracking remote", async () => {
	const result = await resolveForgeRepository(async (command, args) => {
		const key = `${command} ${args.join(" ")}`;
		if (key === "git branch --show-current") return { code: 0, stdout: "feature/x\n", stderr: "" };
		if (key === "git config --get branch.feature/x.remote") return { code: 1, stdout: "", stderr: "" };
		if (key === "git remote get-url origin") return { code: 0, stdout: "https://github.com/acme/widget.git\n", stderr: "" };
		throw new Error(`unexpected command: ${key}`);
	});

	assert.deepEqual(result, {
		ok: true,
		value: { provider: "github", host: "github.com", project: "acme/widget", remote: "origin" },
	});
});

test("ambiguous configured hosts are surfaced instead of guessed", async () => {
	const result = await resolveForgeRepository(async (command, args) => {
		const key = `${command} ${args.join(" ")}`;
		if (key === "git branch --show-current") return { code: 0, stdout: "main\n", stderr: "" };
		if (key === "git config --get branch.main.remote") return { code: 1, stdout: "", stderr: "" };
		if (key === "git remote get-url origin") return { code: 0, stdout: "ssh://git@code.example.com/platform/widget.git\n", stderr: "" };
		if (key === "glab auth status --hostname code.example.com") return { code: 0, stdout: "", stderr: "" };
		if (key === "gh auth status --hostname code.example.com") return { code: 0, stdout: "", stderr: "" };
		throw new Error(`unexpected command: ${key}`);
	});

	assert.equal(result.ok, false);
	assert.match(result.error, /ambiguous/i);
	assert.match(result.error, /explicit GitHub or GitLab URL/i);
});
