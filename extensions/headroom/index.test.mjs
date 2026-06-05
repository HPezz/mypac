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
	const calls = [];
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
			ensureRunning: async (onStatus) => harnessOptions.ensureRunning?.(proxy, onStatus) ?? { ok: true, managed: true },
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
		waitForIdle: async () => {
			calls.push("waitForIdle");
			await harnessOptions.waitForIdle?.();
		},
		ui: {
			theme: { fg: (_style, text) => text },
			setStatus: (key, value) => {
				calls.push(`setStatus:${value}`);
				statuses.push({ key, value });
			},
			setWorkingMessage: (message) => calls.push(`setWorkingMessage:${message ?? ""}`),
			setWorkingVisible: (visible) => calls.push(`setWorkingVisible:${visible}`),
			notify: (message, level) => notifications.push({ message, level }),
		},
	};

	registerHeadroomExtension(pi, createProxy);
	return { commands, events, registered, unregistered, selectedModels, notifications, statuses, proxies, calls, ctx };
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

test("/headroom wrap shows working indicator before waiting for idle", async () => {
	const { commands, calls, notifications, ctx } = createHarness();

	await commands.get("headroom").handler("wrap", ctx);

	assert.equal(calls[0], "setStatus:⏳ Headroom starting...");
	assert.equal(calls[1], "setWorkingMessage:Starting Headroom proxy...");
	assert.equal(calls[2], "setWorkingVisible:true");
	assert.equal(calls[3], "waitForIdle");
	assert.match(notifications[0].message, /Starting Headroom proxy/);
	assert.equal(calls.at(-2), "setWorkingMessage:");
	assert.equal(calls.at(-1), "setWorkingVisible:false");
});

test("/headroom wrap shows proxy startup progress in status UI", async () => {
	const { commands, statuses, calls, ctx } = createHarness({
		ensureRunning: async (_proxy, onStatus) => {
			onStatus("Waiting for Headroom proxy... 12s elapsed");
			return { ok: true, managed: true };
		},
	});

	await commands.get("headroom").handler("wrap", ctx);

	assert.ok(statuses.some((status) => status.value === "⏳ Waiting for Headroom proxy... 12s elapsed"));
	assert.ok(calls.some((call) => call === "setWorkingMessage:Waiting for Headroom proxy... 12s elapsed"));
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

	assert.ok(notifications.some((notification) => /Current provider is local/.test(notification.message)));
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
