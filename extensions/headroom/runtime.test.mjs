import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileHeadroomLeaseStore, HeadroomRuntime } from "./runtime.ts";

const WRAP_OPTIONS = { action: "wrap", port: 8787, mode: "token", binary: "headroom" };

class MemoryLeaseStore {
	constructor(leases = [], alivePids = new Set([process.pid])) {
		this.leases = [...leases];
		this.alivePids = alivePids;
	}

	async acquire(lease) {
		this.leases = this.leases.filter((entry) => entry.instanceId !== lease.instanceId && this.alivePids.has(entry.pid));
		this.leases.push(lease);
	}

	async release(instanceId) {
		this.leases = this.leases.filter((entry) => entry.instanceId !== instanceId && this.alivePids.has(entry.pid));
	}

	async getActiveLeases(port) {
		this.leases = this.leases.filter((entry) => this.alivePids.has(entry.pid));
		return this.leases.filter((entry) => entry.port === port);
	}
}

function createProxy() {
	const proxy = {
		baseUrl: "http://127.0.0.1:8787",
		isManaged: true,
		stopped: false,
		ensureRunning: async () => ({ ok: true, managed: true }),
		stop: async () => {
			proxy.stopped = true;
		},
		health: async () => ({ status: "healthy" }),
		stats: async () => ({}),
	};
	return proxy;
}

test("runtime stop keeps managed proxy running while another active lease exists", async () => {
	const otherLease = { instanceId: "other", pid: 222, port: 8787, mode: "token", binary: "headroom", updatedAt: Date.now() };
	const leases = new MemoryLeaseStore([otherLease], new Set([111, 222]));
	const proxy = createProxy();
	const runtime = new HeadroomRuntime(() => proxy, { leaseStore: leases, instanceId: "current", pid: 111 });

	const attempt = runtime.prepareWrap(WRAP_OPTIONS);
	await attempt.proxy.ensureRunning();
	await runtime.commitWrap(WRAP_OPTIONS, attempt);
	await runtime.stop();

	assert.equal(proxy.stopped, false);
	assert.deepEqual(leases.leases.map((lease) => lease.instanceId), ["other"]);
});

test("runtime stop stops managed proxy when current instance owns final active lease", async () => {
	const leases = new MemoryLeaseStore([], new Set([111]));
	const proxy = createProxy();
	const runtime = new HeadroomRuntime(() => proxy, { leaseStore: leases, instanceId: "current", pid: 111 });

	const attempt = runtime.prepareWrap(WRAP_OPTIONS);
	await attempt.proxy.ensureRunning();
	await runtime.commitWrap(WRAP_OPTIONS, attempt);
	await runtime.stop();

	assert.equal(proxy.stopped, true);
	assert.deepEqual(leases.leases, []);
});

test("runtime lease checks prune stale process records before deciding to keep proxy", async () => {
	const staleLease = { instanceId: "stale", pid: 222, port: 8787, mode: "token", binary: "headroom", updatedAt: Date.now() };
	const leases = new MemoryLeaseStore([staleLease], new Set([111]));
	const proxy = createProxy();
	const runtime = new HeadroomRuntime(() => proxy, { leaseStore: leases, instanceId: "current", pid: 111 });

	const attempt = runtime.prepareWrap(WRAP_OPTIONS);
	await attempt.proxy.ensureRunning();
	await runtime.commitWrap(WRAP_OPTIONS, attempt);
	await runtime.stop();

	assert.equal(proxy.stopped, true);
	assert.deepEqual(leases.leases, []);
});

test("runtime rewrap replaces current lease without releasing it first", async () => {
	const leases = new MemoryLeaseStore([], new Set([111]));
	const operations = [];
	const originalAcquire = leases.acquire.bind(leases);
	const originalRelease = leases.release.bind(leases);
	leases.acquire = async (lease) => {
		operations.push(`acquire:${lease.instanceId}`);
		await originalAcquire(lease);
	};
	leases.release = async (instanceId) => {
		operations.push(`release:${instanceId}`);
		await originalRelease(instanceId);
	};
	const runtime = new HeadroomRuntime(() => createProxy(), { leaseStore: leases, instanceId: "current", pid: 111 });

	const firstAttempt = runtime.prepareWrap(WRAP_OPTIONS);
	await runtime.commitWrap(WRAP_OPTIONS, firstAttempt);
	operations.length = 0;
	const secondOptions = { ...WRAP_OPTIONS, port: 8788 };
	const secondAttempt = runtime.prepareWrap(secondOptions);
	await runtime.commitWrap(secondOptions, secondAttempt);

	assert.deepEqual(operations, ["acquire:current"]);
	assert.deepEqual(leases.leases.map((lease) => [lease.instanceId, lease.port]), [["current", 8788]]);
});

test("runtime rewrap rolls back when stopping previous proxy cannot check leases", async () => {
	const leases = new MemoryLeaseStore([], new Set([111]));
	const runtime = new HeadroomRuntime(() => createProxy(), { leaseStore: leases, instanceId: "current", pid: 111 });
	const firstAttempt = runtime.prepareWrap(WRAP_OPTIONS);
	await runtime.commitWrap(WRAP_OPTIONS, firstAttempt);
	const previousProxy = runtime.activeProxy;
	const previousOptions = runtime.activeOptions;
	const secondOptions = { ...WRAP_OPTIONS, port: 8788 };
	const secondAttempt = runtime.prepareWrap(secondOptions);
	leases.getActiveLeases = async () => {
		throw new Error("lease check failed");
	};

	await assert.rejects(() => runtime.commitWrap(secondOptions, secondAttempt), /lease check failed/);

	assert.equal(runtime.activeProxy, previousProxy);
	assert.deepEqual(runtime.activeOptions, previousOptions);
	assert.equal(runtime.isEnabled, true);
	assert.deepEqual(leases.leases.map((lease) => [lease.instanceId, lease.port]), [["current", 8787]]);
});

test("file lease store prunes invalid non-positive pids", async (t) => {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "headroom-leases-"));
	t.after(() => fs.rm(dir, { recursive: true, force: true }));
	const filePath = path.join(dir, "leases.json");
	const lease = { instanceId: "invalid", pid: 0, port: 8787, mode: "token", binary: "headroom", updatedAt: Date.now() };
	await fs.writeFile(filePath, JSON.stringify({ leases: [lease] }));
	const leases = new FileHeadroomLeaseStore(filePath);

	assert.deepEqual(await leases.getActiveLeases(8787), []);
	assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { leases: [] });
});

test("file lease store prunes unsupported lease modes", async (t) => {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "headroom-leases-"));
	t.after(() => fs.rm(dir, { recursive: true, force: true }));
	const filePath = path.join(dir, "leases.json");
	const lease = { instanceId: "invalid", pid: process.pid, port: 8787, mode: "bad", binary: "headroom", updatedAt: Date.now() };
	await fs.writeFile(filePath, JSON.stringify({ leases: [lease] }));
	const leases = new FileHeadroomLeaseStore(filePath);

	assert.deepEqual(await leases.getActiveLeases(8787), []);
	assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { leases: [] });
});

test("file lease store surfaces malformed lease data instead of overwriting it", async (t) => {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "headroom-leases-"));
	t.after(() => fs.rm(dir, { recursive: true, force: true }));
	const filePath = path.join(dir, "leases.json");
	await fs.writeFile(filePath, "not json");
	const leases = new FileHeadroomLeaseStore(filePath);

	await assert.rejects(() => leases.getActiveLeases(8787), SyntaxError);
	assert.equal(await fs.readFile(filePath, "utf8"), "not json");
});

test("file lease store surfaces wrong lease file shape instead of overwriting it", async (t) => {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "headroom-leases-"));
	t.after(() => fs.rm(dir, { recursive: true, force: true }));
	const filePath = path.join(dir, "leases.json");
	await fs.writeFile(filePath, JSON.stringify({ leases: "oops" }));
	const leases = new FileHeadroomLeaseStore(filePath);

	await assert.rejects(() => leases.getActiveLeases(8787), /Invalid Headroom lease file/);
	assert.deepEqual(JSON.parse(await fs.readFile(filePath, "utf8")), { leases: "oops" });
});


test("file lease store steals stale lock directory", async (t) => {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "headroom-leases-"));
	t.after(() => fs.rm(dir, { recursive: true, force: true }));
	const filePath = path.join(dir, "leases.json");
	const lockPath = `${filePath}.lock`;
	await fs.mkdir(lockPath, { recursive: true });
	const stale = new Date(Date.now() - 60_000);
	await fs.utimes(lockPath, stale, stale);
	const leases = new FileHeadroomLeaseStore(filePath);

	await leases.acquire({ instanceId: "current", pid: process.pid, port: 8787, mode: "token", binary: "headroom", updatedAt: Date.now() });

	assert.deepEqual((await leases.getActiveLeases(8787)).map((lease) => lease.instanceId), ["current"]);
});

test("file lease store preserves original read error when lock cleanup fails", async (t) => {
	const dir = await fs.mkdtemp(path.join(tmpdir(), "headroom-leases-"));
	const originalRm = fs.rm;
	t.after(async () => {
		fs.rm = originalRm;
		await fs.rm(dir, { recursive: true, force: true });
	});
	const filePath = path.join(dir, "leases.json");
	await fs.mkdir(filePath);
	fs.rm = async (target, ...args) => {
		if (String(target).endsWith(".lock")) throw new Error("cleanup failed");
		return originalRm(target, ...args);
	};
	const leases = new FileHeadroomLeaseStore(filePath);

	await assert.rejects(
		() => leases.acquire({ instanceId: "current", pid: process.pid, port: 8787, mode: "token", binary: "headroom", updatedAt: Date.now() }),
		/EISDIR/,
	);
});
