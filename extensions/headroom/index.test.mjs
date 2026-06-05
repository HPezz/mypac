import test from "node:test";
import assert from "node:assert/strict";
import { registerHeadroomExtension } from "./index.ts";

function createHarness(harnessOptions = {}) {
	const commands = new Map();
	const events = new Map();
	const registered = [];
	const unregistered = [];
	const selectedModels = [];
	const notifications = [];
	const statuses = [];
	const proxies = [];
	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		on(event, handler) {
			events.set(event, handler);
		},
		registerProvider(provider, config) {
			registered.push({ provider, config });
		},
		unregisterProvider(provider) {
			unregistered.push(provider);
		},
		setModel: async (model) => {
			selectedModels.push(model);
			return harnessOptions.setModelResult ?? true;
		},
	};
	const createProxy = (options) => {
		const proxy = {
			options,
			baseUrl: `http://127.0.0.1:${options.port}`,
			isManaged: true,
			stopped: false,
			ensureRunning: async () => harnessOptions.ensureRunning?.(proxy) ?? { ok: true, managed: true },
			stop: async () => {
				proxy.stopped = true;
			},
			health: async () => ({ status: "healthy" }),
			stats: async () => ({}),
		};
		proxies.push(proxy);
		return proxy;
	};
	const ctx = {
		hasUI: true,
		model: { provider: "openai-codex", id: "gpt-5" },
		waitForIdle: async () => {},
		ui: {
			theme: { fg: (_style, text) => text },
			setStatus: (key, value) => statuses.push({ key, value }),
			notify: (message, level) => notifications.push({ message, level }),
		},
	};

	registerHeadroomExtension(pi, createProxy);
	return { commands, events, registered, unregistered, selectedModels, notifications, statuses, proxies, ctx };
}

test("/headroom description advertises binary override option", () => {
	const { commands } = createHarness();
	assert.match(commands.get("headroom").description, /--bin <headroom>/);
});

test("/headroom stop before wrap is a no-op and stop after wrap unregisters providers", async () => {
	const { commands, registered, unregistered, selectedModels, notifications, proxies, ctx } = createHarness();
	const handler = commands.get("headroom").handler;

	await handler("stop", ctx);
	assert.deepEqual(unregistered, []);
	assert.deepEqual(notifications, []);

	await handler("wrap --port 9999 --mode cache --bin /opt/headroom", ctx);
	assert.deepEqual(registered.map((entry) => entry.provider), ["openai-codex", "openai", "anthropic"]);
	assert.deepEqual(registered.map((entry) => entry.config.baseUrl), [
		"http://127.0.0.1:9999/v1",
		"http://127.0.0.1:9999/v1",
		"http://127.0.0.1:9999",
	]);
	assert.deepEqual(selectedModels, [ctx.model]);
	assert.equal(proxies[0].options.binary, "/opt/headroom");

	await handler("stop", ctx);
	assert.deepEqual(unregistered, ["openai-codex", "openai", "anthropic"]);
	assert.equal(proxies[0].stopped, true);
	assert.deepEqual(selectedModels, [ctx.model, ctx.model]);
	assert.match(notifications.at(-1).message, /Headroom disabled/);
});

test("/headroom wrap failure detects missing binary through error code", async () => {
	const error = new Error("spawn failed");
	error.code = "ENOENT";
	const { commands, notifications, ctx } = createHarness({
		ensureRunning: async () => ({ ok: false, error }),
	});

	await commands.get("headroom").handler("wrap --bin missing-headroom", ctx);

	assert.match(notifications.at(-1).message, /uv tool install/);
});

test("/headroom wrap failure with existing manager rolls back stale routing", async () => {
	let ensureCalls = 0;
	const { commands, unregistered, selectedModels, statuses, ctx } = createHarness({
		ensureRunning: async () => {
			ensureCalls++;
			return ensureCalls === 1 ? { ok: true, managed: true } : { ok: false, error: new Error("offline") };
		},
	});
	const handler = commands.get("headroom").handler;

	await handler("wrap", ctx);
	await handler("wrap", ctx);

	assert.deepEqual(unregistered, ["openai-codex", "openai", "anthropic"]);
	assert.deepEqual(selectedModels, [ctx.model, ctx.model]);
	assert.equal(statuses.at(-1).value, "⚠ Headroom offline");
});

test("/headroom wrap notes when current provider is not routed", async () => {
	const { commands, notifications, ctx } = createHarness();
	ctx.model = { provider: "local", id: "dev-model" };

	await commands.get("headroom").handler("wrap", ctx);

	assert.match(notifications.at(-1).message, /Current provider is local/);
});

test("session shutdown cleans up only after Headroom registered providers", async () => {
	const { commands, events, unregistered, proxies, ctx } = createHarness();
	const shutdown = events.get("session_shutdown");

	await shutdown();
	assert.deepEqual(unregistered, []);

	await commands.get("headroom").handler("wrap", ctx);
	await shutdown();
	assert.deepEqual(unregistered, ["openai-codex", "openai", "anthropic"]);
	assert.equal(proxies[0].stopped, true);
});
