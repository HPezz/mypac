import test from "node:test";
import assert from "node:assert/strict";
import { registerHeadroomExtension } from "./index.ts";
import { HeadroomRuntime } from "./runtime.ts";
import { HEADROOM_FOOTER_STATE_EVENT } from "./state.ts";

class MemoryLeaseStore {
	constructor() {
		this.leases = [];
	}

	async acquire(lease) {
		this.leases = this.leases.filter((entry) => entry.instanceId !== lease.instanceId);
		this.leases.push(lease);
	}

	async release(instanceId) {
		this.leases = this.leases.filter((entry) => entry.instanceId !== instanceId);
	}

	async getActiveLeases(port) {
		return this.leases.filter((entry) => entry.port === port);
	}
}

function createHarness(harnessOptions = {}) {
	const commands = new Map();
	const events = new Map();
	const registered = [];
	const unregistered = [];
	const selectedModels = [];
	const notifications = [];
	const statuses = [];
	const calls = [];
	const footerEvents = [];
	const proxies = [];
	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		on(event, handler) {
			events.set(event, handler);
		},
		registerProvider(provider, config) {
			harnessOptions.registerProvider?.(provider, config);
			registered.push({ provider, config });
		},
		unregisterProvider(provider) {
			harnessOptions.unregisterProvider?.(provider);
			unregistered.push(provider);
		},
		setModel: async (model) => {
			selectedModels.push(model);
			return harnessOptions.setModelResult ?? true;
		},
		events: {
			emit: (channel, data) => footerEvents.push({ channel, data }),
			on: () => () => {},
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
			health: async () => harnessOptions.health?.(proxy) ?? { status: "healthy" },
			stats: async () => harnessOptions.stats?.(proxy) ?? {},
		};
		proxies.push(proxy);
		return proxy;
	};
	const runtime = harnessOptions.runtime ?? new HeadroomRuntime(createProxy, { leaseStore: harnessOptions.leaseStore ?? new MemoryLeaseStore() });
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

	registerHeadroomExtension(pi, createProxy, runtime);
	return { commands, events, registered, unregistered, selectedModels, notifications, statuses, proxies, footerEvents, calls, ctx, runtime };
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

test("/headroom wrap and stop publish footer state events", async () => {
	const { commands, footerEvents, ctx } = createHarness();

	await commands.get("headroom").handler("wrap", ctx);
	await commands.get("headroom").handler("stop", ctx);

	assert.deepEqual(footerEvents, [
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: undefined, compressionPercent: undefined } },
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "not_started" } },
	]);
});

test("/headroom refreshes footer savings after each turn", async () => {
	const stats = [
		{ summary: { compression: { total_tokens_removed: 0, avg_compression_pct: 0 } } },
		{ summary: { compression: { total_tokens_removed: 1234, avg_compression_pct: 17.6 } } },
	];
	const { commands, events, footerEvents, ctx } = createHarness({ stats: async () => stats.shift() ?? stats.at(-1) });

	await commands.get("headroom").handler("wrap", ctx);
	await events.get("turn_end")({}, ctx);

	assert.deepEqual(footerEvents, [
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 0, compressionPercent: 0 } },
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 1234, compressionPercent: 17.6 } },
	]);
});

test("/headroom status refreshes enabled footer savings", async () => {
	const stats = [
		{ summary: { compression: { total_tokens_removed: 0, avg_compression_pct: 0 } } },
		{ summary: { compression: { total_tokens_removed: 2345, avg_compression_pct: 22.4 } } },
	];
	const { commands, footerEvents, ctx } = createHarness({ stats: async () => stats.shift() ?? stats.at(-1) });

	await commands.get("headroom").handler("wrap", ctx);
	await commands.get("headroom").handler("status", ctx);

	assert.deepEqual(footerEvents, [
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 0, compressionPercent: 0 } },
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 2345, compressionPercent: 22.4 } },
	]);
});

test("turn_end stats refresh preserves error footer status", async () => {
	let offline = false;
	const { commands, events, footerEvents, ctx } = createHarness({
		health: async () => {
			if (offline) throw new Error("offline");
			return { status: "healthy" };
		},
		stats: async () => {
			if (offline) throw new Error("offline");
			return { summary: { compression: { total_tokens_removed: 0, avg_compression_pct: 0 } } };
		},
	});

	await commands.get("headroom").handler("wrap", ctx);
	offline = true;
	await commands.get("headroom").handler("status", ctx);
	await events.get("turn_end")({}, ctx);

	assert.deepEqual(footerEvents, [
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 0, compressionPercent: 0 } },
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "error" } },
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "error" } },
	]);
});

test("in-flight turn_end stats refresh does not publish after stop", async () => {
	let statsCalls = 0;
	let resolveTurnStats;
	const turnStats = new Promise((resolve) => {
		resolveTurnStats = resolve;
	});
	const { commands, events, footerEvents, ctx } = createHarness({
		stats: async () => {
			statsCalls++;
			if (statsCalls === 1) return { summary: { compression: { total_tokens_removed: 0, avg_compression_pct: 0 } } };
			return turnStats;
		},
	});

	await commands.get("headroom").handler("wrap", ctx);
	const turnEnd = events.get("turn_end")({}, ctx);
	assert.equal(statsCalls, 2);
	await commands.get("headroom").handler("stop", ctx);
	resolveTurnStats({ summary: { compression: { total_tokens_removed: 1234, avg_compression_pct: 17.6 } } });
	await turnEnd;

	assert.deepEqual(footerEvents, [
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 0, compressionPercent: 0 } },
		{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "not_started" } },
	]);
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

test("/headroom wrap provider registration failure preserves existing runtime proxy", async () => {
	const { commands, runtime, proxies, notifications, ctx } = createHarness({
		registerProvider: (_provider, config) => {
			if (config.baseUrl.includes("8788")) throw new Error("register failed");
		},
	});
	const handler = commands.get("headroom").handler;

	await handler("wrap --port 8787", ctx);
	const previousProxy = runtime.activeProxy;
	await handler("wrap --port 8788", ctx);

	assert.equal(runtime.activeProxy, previousProxy);
	assert.equal(proxies[0].stopped, false);
	assert.equal(proxies[1].stopped, true);
	assert.ok(notifications.some((notification) => /Failed to register Headroom routing/.test(notification.message)));
});

test("/headroom wrap provider registration failure keeps cleanup armed", async () => {
	const { commands, events, unregistered, ctx } = createHarness({
		registerProvider: () => {
			throw new Error("register failed");
		},
	});

	await commands.get("headroom").handler("wrap", ctx);
	await events.get("session_shutdown")({ reason: "exit" });

	assert.deepEqual(unregistered, ["openai-codex", "openai", "anthropic"]);
});

test("/headroom wrap provider registration failure reports even when rollback routing fails", async () => {
	const { commands, notifications, ctx } = createHarness({
		registerProvider: () => {
			throw new Error("register failed");
		},
		unregisterProvider: () => {
			throw new Error("unregister failed");
		},
	});

	await assert.doesNotReject(() => commands.get("headroom").handler("wrap", ctx));

	assert.ok(notifications.some((notification) => /Failed to register Headroom routing/.test(notification.message)));
	assert.ok(notifications.some((notification) => /Failed to restore Headroom routing/.test(notification.message)));
});

test("session_start provider restore failure is reported", async () => {
	let failRestore = false;
	const { commands, events, notifications, statuses, ctx } = createHarness({
		registerProvider: () => {
			if (failRestore) throw new Error("restore failed");
		},
	});

	await commands.get("headroom").handler("wrap", ctx);
	failRestore = true;
	await assert.doesNotReject(() => events.get("session_start")({}, ctx));

	assert.ok(notifications.some((notification) => /Failed to restore Headroom routing/.test(notification.message)));
	assert.ok(statuses.some((status) => status.value === "⚠ Headroom offline"));
});

test("/headroom wrap rejects same-port mode changes while enabled", async () => {
	const { commands, runtime, proxies, notifications, ctx } = createHarness();
	const handler = commands.get("headroom").handler;

	await handler("wrap --port 8787 --mode token", ctx);
	const previousProxy = runtime.activeProxy;
	await handler("wrap --port 8787 --mode cache", ctx);

	assert.equal(runtime.activeProxy, previousProxy);
	assert.equal(proxies.length, 1);
	assert.match(notifications.at(-1).message, /run `\/headroom stop` first/);
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

test("session handoff preserves active Headroom runtime and re-registers providers", async () => {
	const first = createHarness();
	const handler = first.commands.get("headroom").handler;

	await handler("wrap --port 9999", first.ctx);
	await first.events.get("session_shutdown")({ reason: "new" });

	assert.deepEqual(first.unregistered, ["openai-codex", "openai", "anthropic"]);
	assert.equal(first.proxies[0].stopped, false);

	const second = createHarness({ runtime: first.runtime });
	await second.events.get("session_start")({ reason: "new", previousSessionFile: "old.jsonl" }, second.ctx);

	assert.deepEqual(second.registered.map((entry) => entry.provider), ["openai-codex", "openai", "anthropic"]);
	assert.deepEqual(second.registered.map((entry) => entry.config.baseUrl), [
		"http://127.0.0.1:9999/v1",
		"http://127.0.0.1:9999/v1",
		"http://127.0.0.1:9999",
	]);
	assert.deepEqual(second.selectedModels, [second.ctx.model]);
	assert.equal(second.statuses.at(-1).value, "✓ Headroom");
});
