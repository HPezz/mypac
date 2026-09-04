import test from "node:test";
import assert from "node:assert/strict";
import ghiExtension from "./index.ts";
import {
	buildIssueCreatePrompt,
	buildIssueSessionName,
	findExplicitForgeUrl,
	normalizeIssueNote,
} from "./helpers.ts";

test("normalizeIssueNote trims surrounding whitespace", () => {
	assert.equal(normalizeIssueNote("  fix README install steps  \n"), "fix README install steps");
});

test("findExplicitForgeUrl finds a forge target inside the note", () => {
	assert.equal(
		findExplicitForgeUrl("Create this beside https://git.example.com/group/app/-/issues/42."),
		"https://git.example.com/group/app/-/issues/42",
	);
});

test("buildIssueCreatePrompt keeps the issue note at the end for GitLab", () => {
	const prompt = buildIssueCreatePrompt(
		"Skill instructions",
		"Need a better issue command",
		{ provider: "gitlab", host: "git.example.com", project: "group/app" },
	);
	assert.ok(prompt.startsWith("Skill instructions\n\n---\n\nCreate a GitLab issue"));
	assert.match(prompt, /glab/);
	assert.match(prompt, /group\/app/);
	assert.match(prompt, /Infer and apply an existing pac workflow state label/);
	assert.ok(prompt.endsWith("Issue note:\nNeed a better issue command"));
});

test("buildIssueSessionName preserves the existing ghi prefix", () => {
	assert.equal(buildIssueSessionName("  Need a better /ghi MVP  "), "ghi - Need a better /ghi MVP");
});

test("/issue-create and /ghi register the same implementation and preserve GitHub behavior", async () => {
	const commands = new Map();
	const messages = [];
	const sessionNames = [];
	const calls = [];
	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		async exec(command, args) {
			calls.push([command, args]);
			const key = `${command} ${args.join(" ")}`;
			if (key === "git rev-parse --is-inside-work-tree") return { code: 0, stdout: "true\n", stderr: "" };
			if (key === "git branch --show-current") return { code: 0, stdout: "main\n", stderr: "" };
			if (key === "git config --get branch.main.remote") return { code: 1, stdout: "", stderr: "" };
			if (key === "git remote get-url origin") return { code: 0, stdout: "https://github.com/acme/widget.git\n", stderr: "" };
			throw new Error(`unexpected command: ${key}`);
		},
		setSessionName(name) {
			sessionNames.push(name);
		},
		sendUserMessage(message) {
			messages.push(message);
		},
	};
	ghiExtension(pi, {
		loadPackageSkill: async (name) => {
			assert.equal(name, "pac-issue-create");
			return { content: "forge-neutral skill" };
		},
	});

	assert.equal(commands.get("issue-create").handler, commands.get("ghi").handler);
	await commands.get("ghi").handler("fix README install steps", {
		isIdle: () => true,
		hasUI: false,
		ui: { notify() {} },
	});

	assert.equal(messages.length, 1);
	assert.match(messages[0], /Create a GitHub issue/);
	assert.match(messages[0], /\bgh\b/);
	assert.deepEqual(sessionNames, ["ghi - fix README install steps"]);
});

test("issue creation resolves an explicit self-hosted GitLab URL before remotes", async () => {
	const commands = new Map();
	const messages = [];
	const calls = [];
	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		async exec(command, args) {
			calls.push([command, args]);
			if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: "true\n", stderr: "" };
			throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		},
		setSessionName() {},
		sendUserMessage(message) {
			messages.push(message);
		},
	};
	ghiExtension(pi, { loadPackageSkill: async () => ({ content: "forge-neutral skill" }) });

	await commands.get("issue-create").handler(
		"Mirror https://git.example.com/platform/apps/widget/-/issues/12",
		{ isIdle: () => true, hasUI: false, ui: { notify() {} } },
	);

	assert.equal(messages.length, 1);
	assert.match(messages[0], /Create a GitLab issue/);
	assert.match(messages[0], /git\.example\.com/);
	assert.equal(calls.length, 1, "explicit URL should avoid remote discovery after the git repository check");
});
