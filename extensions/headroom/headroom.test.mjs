import test from "node:test";
import assert from "node:assert/strict";
import {
	buildProviderOverrides,
	buildProxyArgs,
	formatStatus,
	getInstallGuidance,
	parseHeadroomArgs,
} from "./helpers.ts";
import { HeadroomProxyManager } from "./proxy.ts";

test("parses wrap defaults and env overrides", () => {
	assert.deepEqual(parseHeadroomArgs("wrap", {}), {
		action: "wrap",
		port: 8787,
		mode: "token",
		binary: "headroom",
	});
	assert.deepEqual(parseHeadroomArgs("wrap --port 8877 --mode cache --bin /opt/headroom", {}), {
		action: "wrap",
		port: 8877,
		mode: "cache",
		binary: "/opt/headroom",
	});
	assert.deepEqual(parseHeadroomArgs('wrap --bin "/opt/my headroom/headroom" --mode cache', {}), {
		action: "wrap",
		port: 8787,
		mode: "cache",
		binary: "/opt/my headroom/headroom",
	});
	assert.deepEqual(parseHeadroomArgs("wrap --bin /opt/my\\ headroom/headroom", {}), {
		action: "wrap",
		port: 8787,
		mode: "token",
		binary: "/opt/my headroom/headroom",
	});
	assert.deepEqual(parseHeadroomArgs("stop", { HEADROOM_PORT: "9999", HEADROOM_MODE: "cache", HEADROOM_BIN: "hr" }), {
		action: "stop",
		port: 9999,
		mode: "cache",
		binary: "hr",
	});
});

test("rejects invalid command options", () => {
	assert.throws(() => parseHeadroomArgs("wrap --mode fast", {}), /--mode/);
	assert.throws(() => parseHeadroomArgs("wrap --port 99999", {}), /--port/);
	assert.throws(() => parseHeadroomArgs("wat", {}), /Usage/);
});

test("builds proxy spawn args", () => {
	assert.deepEqual(buildProxyArgs({ port: 8877, mode: "cache" }), ["proxy", "--port", "8877", "--mode", "cache"]);
});

test("builds provider overrides for supported Pi providers", () => {
	assert.deepEqual(buildProviderOverrides(8787), [
		{ provider: "openai-codex", config: { baseUrl: "http://127.0.0.1:8787/v1" } },
		{ provider: "openai", config: { baseUrl: "http://127.0.0.1:8787/v1" } },
		{ provider: "anthropic", config: { baseUrl: "http://127.0.0.1:8787" } },
	]);
});

test("install guidance recommends uv tool install, not npm or pip", () => {
	const guidance = getInstallGuidance("headroom");
	assert.match(guidance, /uv tool install --python 3\.12 'headroom-ai\[proxy\]'/);
	assert.doesNotMatch(guidance, /npm install/);
	assert.doesNotMatch(guidance, /pip install/);
});

test("formats status with health and stats summary", () => {
	const status = formatStatus({
		enabled: true,
		managed: true,
		baseUrl: "http://127.0.0.1:8787",
		health: { status: "healthy", ready: true, version: "0.22.3" },
		stats: { summary: { api_requests: 2, compression: { total_tokens_removed: 1234, avg_compression_pct: 42 } } },
	});
	assert.match(status, /Headroom: enabled/);
	assert.match(status, /Proxy: managed by Pi/);
	assert.match(status, /Health: healthy/);
	assert.match(status, /Requests: 2/);
	assert.match(status, /Tokens removed: 1234/);
});

test("proxy manager reuses healthy external proxy without owning it", async () => {
	let spawned = false;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => {
			spawned = true;
			throw new Error("should not spawn");
		},
		fetchJson: async () => ({ status: "healthy" }),
		sleep: async () => {},
	});

	const result = await manager.ensureRunning();
	assert.deepEqual(result, { ok: true, managed: false });
	assert.equal(spawned, false);
	assert.equal(manager.isManaged, false);
});

test("proxy manager owns and stops only spawned healthy proxy", async () => {
	const kills = [];
	const child = {
		exitCode: null,
		kill(signal) {
			kills.push(signal ?? "default");
			this.exitCode = 0;
			return true;
		},
		on() { return this; },
		unref() {},
	};
	let healthCalls = 0;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: (command, args) => {
			assert.equal(command, "headroom");
			assert.deepEqual(args, ["proxy", "--port", "8787", "--mode", "token"]);
			return child;
		},
		fetchJson: async () => {
			healthCalls++;
			if (healthCalls === 1) throw new Error("not running yet");
			return { status: "healthy" };
		},
		sleep: async () => {},
	});

	const result = await manager.ensureRunning();
	assert.deepEqual(result, { ok: true, managed: true });
	assert.equal(manager.isManaged, true);

	await manager.stop();
	assert.deepEqual(kills, [process.platform === "win32" ? "default" : "SIGTERM"]);
	assert.equal(manager.isManaged, false);
});

test("proxy manager does not kill external proxy on stop", async () => {
	let killed = false;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => ({ exitCode: null, kill: () => { killed = true; return true; }, on() { return this; } }),
		fetchJson: async () => ({ status: "healthy" }),
		sleep: async () => {},
	});

	await manager.ensureRunning();
	await manager.stop();
	assert.equal(killed, false);
});

test("proxy manager reports spawn errors such as missing headroom binary", async () => {
	let errorListener;
	const manager = new HeadroomProxyManager({ binary: "missing-headroom", port: 8787, mode: "token" }, {
		spawn: () => ({
			exitCode: null,
			kill: () => true,
			on(event, listener) {
				if (event === "error") errorListener = listener;
				return this;
			},
		}),
		fetchJson: async () => { throw new Error("offline"); },
		sleep: async () => { errorListener?.(new Error("spawn missing-headroom ENOENT")); },
	});

	const result = await manager.ensureRunning();
	assert.equal(result.ok, false);
	assert.match(result.error.message, /ENOENT/);
});

test("proxy manager keeps waiting for slow Headroom startup and reports progress", async () => {
	const child = {
		exitCode: null,
		kill: () => true,
		on() { return this; },
	};
	let healthCalls = 0;
	const sleeps = [];
	const statuses = [];
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => child,
		fetchJson: async () => {
			healthCalls++;
			if (healthCalls < 16) throw new Error("offline");
			return { status: "healthy" };
		},
		sleep: async (ms) => {
			sleeps.push(ms);
		},
	});

	const result = await manager.ensureRunning((message) => statuses.push(message));

	assert.deepEqual(result, { ok: true, managed: true });
	assert.equal(manager.isManaged, true);
	assert.ok(sleeps.reduce((total, delay) => total + delay, 0) > 10_250);
	assert.ok(statuses.some((message) => /Waiting for Headroom proxy/.test(message)));
});

test("proxy manager kills a spawned proxy that never becomes healthy", async () => {
	const kills = [];
	const child = {
		exitCode: null,
		kill(signal) {
			kills.push(signal ?? "default");
			this.exitCode = 0;
			return true;
		},
		on() { return this; },
	};
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => child,
		fetchJson: async () => { throw new Error("offline"); },
		sleep: async () => {},
	});

	const result = await manager.ensureRunning();
	assert.equal(result.ok, false);
	assert.deepEqual(kills, [process.platform === "win32" ? "default" : "SIGTERM"]);
	assert.equal(manager.isManaged, false);
});

test("proxy manager escalates stubborn managed proxies and suppresses kill races", async () => {
	const kills = [];
	let first = true;
	const child = {
		exitCode: null,
		kill(signal) {
			kills.push(signal ?? "default");
			if (first) {
				first = false;
				return true;
			}
			throw new Error("ESRCH");
		},
		on() { return this; },
	};
	let healthCalls = 0;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => child,
		fetchJson: async () => {
			healthCalls++;
			if (healthCalls === 1) throw new Error("offline");
			return { status: "healthy" };
		},
		sleep: async () => {},
	});

	await manager.ensureRunning();
	await manager.stop();
	assert.deepEqual(kills, process.platform === "win32" ? ["default", "default"] : ["SIGTERM", "SIGKILL"]);
	assert.equal(manager.isManaged, false);
});

test("proxy manager clears managed state when spawned proxy exits", async () => {
	let exitListener;
	const child = {
		exitCode: null,
		kill: () => true,
		on(event, listener) {
			if (event === "exit") exitListener = listener;
			return this;
		},
	};
	let healthCalls = 0;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => child,
		fetchJson: async () => {
			healthCalls++;
			if (healthCalls === 1) throw new Error("offline");
			return { status: "healthy" };
		},
		sleep: async () => {},
	});

	await manager.ensureRunning();
	assert.equal(manager.isManaged, true);

	child.exitCode = 0;
	exitListener();
	assert.equal(manager.isManaged, false);
});

test("proxy manager stops unhealthy managed proxy before restart", async () => {
	const kills = [];
	const children = [
		{
			exitCode: null,
			kill(signal) {
				kills.push(signal ?? "default");
				this.exitCode = 0;
				return true;
			},
			on() { return this; },
		},
		{
			exitCode: null,
			kill: () => true,
			on() { return this; },
		},
	];
	let spawnCount = 0;
	let healthCalls = 0;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => children[spawnCount++],
		fetchJson: async () => {
			healthCalls++;
			if (healthCalls === 1 || healthCalls === 3) throw new Error("offline");
			return { status: "healthy" };
		},
		sleep: async () => {},
	});

	await manager.ensureRunning();
	assert.equal(manager.isManaged, true);

	await manager.ensureRunning();
	assert.equal(spawnCount, 2);
	assert.deepEqual(kills, [process.platform === "win32" ? "default" : "SIGTERM"]);
});

test("proxy manager does not claim ownership if spawned proxy exits before external health appears", async () => {
	let exitListener;
	const child = {
		exitCode: null,
		kill: () => true,
		on(event, listener) {
			if (event === "exit") exitListener = listener;
			return this;
		},
	};
	let healthCalls = 0;
	const manager = new HeadroomProxyManager({ binary: "headroom", port: 8787, mode: "token" }, {
		spawn: () => child,
		fetchJson: async () => {
			healthCalls++;
			if (healthCalls === 1) throw new Error("offline");
			return { status: "healthy" };
		},
		sleep: async () => {
			if (exitListener && child.exitCode === null) {
				child.exitCode = 0;
				exitListener();
			}
		},
	});

	const result = await manager.ensureRunning();
	assert.deepEqual(result, { ok: true, managed: false });
	assert.equal(manager.isManaged, false);
});
