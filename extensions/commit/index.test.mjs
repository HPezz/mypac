import test from "node:test";
import assert from "node:assert/strict";
import commitExtension from "./index.ts";

test("/commit exits before switching models when pac-commit skill is missing", async () => {
	const commands = new Map();
	const notifications = [];
	const setModelCalls = [];
	const sentMessages = [];

	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition.handler);
		},
		on() {},
		exec: async (command, args) => {
			if (command === "git" && args[0] === "rev-parse") {
				return { code: 0, stdout: "true\n", stderr: "" };
			}
			if (command === "git" && args[0] === "status") {
				return { code: 0, stdout: " M README.md\n", stderr: "" };
			}
			throw new Error(`Unexpected exec call: ${command} ${args.join(" ")}`);
		},
		setModel: async (model) => {
			setModelCalls.push(model);
			return true;
		},
		sendUserMessage(message) {
			sentMessages.push(message);
		},
	};

	commitExtension(pi, {
		loadPackageSkill: async () => null,
	});

	const handler = commands.get("commit");
	assert.equal(typeof handler, "function");

	await handler("", {
		isIdle: () => true,
		cwd: process.cwd(),
		model: { provider: "anthropic", id: "claude-sonnet" },
		modelRegistry: {
			find: () => ({ provider: "openai-codex", id: "gpt-5.4-mini" }),
		},
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
	});

	assert.deepEqual(setModelCalls, []);
	assert.deepEqual(sentMessages, []);
	assert.deepEqual(notifications, [
		{ message: "Could not load skills/pac-commit/SKILL.md", level: "error" },
	]);
});

test("/commit restores the caller model and thinking level after the commit turn", async () => {
	const commands = new Map();
	const events = new Map();
	const modelState = { provider: "anthropic", id: "claude-sonnet" };
	let thinkingLevel = "high";
	const thinkingLevelCalls = [];
	const sentMessages = [];
	const models = {
		"openai-codex/gpt-5.4-mini": { provider: "openai-codex", id: "gpt-5.4-mini" },
		"anthropic/claude-sonnet": { provider: "anthropic", id: "claude-sonnet" },
	};

	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition.handler);
		},
		on(event, handler) {
			events.set(event, handler);
		},
		exec: async (_command, args) => {
			if (args[0] === "rev-parse") return { code: 0, stdout: "true\n", stderr: "" };
			if (args[0] === "status") return { code: 0, stdout: " M README.md\n", stderr: "" };
			throw new Error(`Unexpected git args: ${args.join(" ")}`);
		},
		getThinkingLevel: () => thinkingLevel,
		setThinkingLevel(level) {
			thinkingLevel = level;
			thinkingLevelCalls.push(level);
		},
		async setModel(model) {
			modelState.provider = model.provider;
			modelState.id = model.id;
			thinkingLevel = model.id === "gpt-5.4-mini" ? "low" : "medium";
			return true;
		},
		sendUserMessage(message) {
			sentMessages.push(message);
		},
	};

	commitExtension(pi, {
		loadPackageSkill: async () => ({ content: "commit skill" }),
	});

	const ctx = {
		isIdle: () => true,
		cwd: process.cwd(),
		get model() {
			return modelState;
		},
		modelRegistry: {
			find: (provider, id) => models[`${provider}/${id}`],
		},
		ui: { notify() {} },
	};

	await commands.get("commit")("", ctx);
	assert.equal(modelState.id, "gpt-5.4-mini");
	assert.equal(thinkingLevel, "low");
	assert.equal(sentMessages.length, 1);

	await events.get("agent_end")({}, ctx);
	assert.deepEqual(modelState, { provider: "anthropic", id: "claude-sonnet" });
	assert.equal(thinkingLevel, "high");
	assert.deepEqual(thinkingLevelCalls, ["high"]);
});
