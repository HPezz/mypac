import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { HeadroomOptions } from "./helpers.ts";

export interface HeadroomProxy {
	baseUrl: string;
	isManaged: boolean;
	ensureRunning(onStatus?: (message: string) => void): Promise<{ ok: true; managed: boolean } | { ok: false; error: Error }>;
	stop(): Promise<void>;
	health(): Promise<unknown>;
	stats(): Promise<unknown>;
}

export type CreateHeadroomProxy = (options: HeadroomOptions) => HeadroomProxy;

export interface HeadroomLease {
	instanceId: string;
	pid: number;
	port: number;
	mode: HeadroomOptions["mode"];
	binary: HeadroomOptions["binary"];
	updatedAt: number;
}

export interface HeadroomLeaseStore {
	acquire(lease: HeadroomLease): Promise<void>;
	release(instanceId: string): Promise<void>;
	getActiveLeases(port: number): Promise<HeadroomLease[]>;
}

export interface HeadroomWrapAttempt {
	proxy: HeadroomProxy;
	previousProxy: HeadroomProxy | null;
	previousOptions: HeadroomOptions | null;
	shouldReplaceProxy: boolean;
}

const PROCESS_RUNTIME_KEY = Symbol.for("mypac.headroom.runtime");
const LOCK_TIMEOUT_MS = 2_000;
const LOCK_RETRY_MS = 25;
const LOCK_STALE_MS = 10_000;

export class HeadroomRuntime {
	private enabled = false;
	private proxy: HeadroomProxy | null = null;
	private options: HeadroomOptions | null = null;
	private createProxy: CreateHeadroomProxy;
	private readonly instanceId: string;
	private readonly leaseStore: HeadroomLeaseStore;
	private readonly pid: number;

	constructor(createProxy: CreateHeadroomProxy, options: { leaseStore?: HeadroomLeaseStore; instanceId?: string; pid?: number } = {}) {
		this.createProxy = createProxy;
		this.leaseStore = options.leaseStore ?? new FileHeadroomLeaseStore();
		this.instanceId = options.instanceId ?? createInstanceId();
		this.pid = options.pid ?? process.pid;
	}

	setCreateProxy(createProxy: CreateHeadroomProxy): void {
		this.createProxy = createProxy;
	}

	get isEnabled(): boolean {
		return this.enabled;
	}

	get activeProxy(): HeadroomProxy | null {
		return this.proxy;
	}

	get activeOptions(): HeadroomOptions | null {
		return this.options;
	}

	prepareWrap(options: HeadroomOptions): HeadroomWrapAttempt {
		const shouldReplaceProxy = !this.proxy || this.optionsChanged(options);
		return {
			proxy: shouldReplaceProxy ? this.createProxy(options) : this.proxy!,
			previousProxy: this.proxy,
			previousOptions: this.options,
			shouldReplaceProxy,
		};
	}

	async commitWrap(options: HeadroomOptions, attempt: HeadroomWrapAttempt): Promise<void> {
		const previousEnabled = this.enabled;
		const previousProxy = this.proxy;
		const previousOptions = this.options;

		await this.leaseStore.acquire(this.createLease(options));

		try {
			if (attempt.shouldReplaceProxy) {
				this.proxy = attempt.proxy;
				this.options = options;
				if (attempt.previousProxy && attempt.previousProxy !== attempt.proxy) {
					await this.stopProxyIfUnleased(attempt.previousProxy, attempt.previousOptions);
				}
			}
			this.enabled = true;
		} catch (error) {
			this.enabled = previousEnabled;
			this.proxy = previousProxy;
			this.options = previousOptions;
			if (previousEnabled && previousOptions) {
				await this.leaseStore.acquire(this.createLease(previousOptions));
			} else {
				await this.leaseStore.release(this.instanceId);
			}
			throw error;
		}
	}

	async abandonFailedWrap(attempt: HeadroomWrapAttempt): Promise<void> {
		if (attempt.shouldReplaceProxy) await attempt.proxy.stop();
	}

	async clearRoutingState(): Promise<void> {
		if (this.enabled || this.options) await this.leaseStore.release(this.instanceId);
		this.enabled = false;
		this.proxy = null;
		this.options = null;
	}

	async stop(): Promise<void> {
		const proxy = this.proxy;
		const options = this.options;
		await this.clearRoutingState();
		if (proxy) await this.stopProxyIfUnleased(proxy, options);
	}

	private async stopProxyIfUnleased(proxy: HeadroomProxy, options: HeadroomOptions | null): Promise<void> {
		if (!options) {
			await proxy.stop();
			return;
		}
		const activeLeases = await this.leaseStore.getActiveLeases(options.port);
		if (activeLeases.length === 0) await proxy.stop();
	}

	private optionsChanged(options: HeadroomOptions): boolean {
		return !this.options || this.options.port !== options.port || this.options.mode !== options.mode || this.options.binary !== options.binary;
	}

	private createLease(options: HeadroomOptions): HeadroomLease {
		return {
			instanceId: this.instanceId,
			pid: this.pid,
			port: options.port,
			mode: options.mode,
			binary: options.binary,
			updatedAt: Date.now(),
		};
	}
}

export class FileHeadroomLeaseStore implements HeadroomLeaseStore {
	private readonly filePath: string;
	private readonly lockPath: string;

	constructor(filePath = defaultLeaseFilePath()) {
		this.filePath = filePath;
		this.lockPath = `${filePath}.lock`;
	}

	async acquire(lease: HeadroomLease): Promise<void> {
		await this.update((leases) => {
			const next = leases.filter((entry) => entry.instanceId !== lease.instanceId);
			next.push(lease);
			return next;
		});
	}

	async release(instanceId: string): Promise<void> {
		await this.update((leases) => leases.filter((entry) => entry.instanceId !== instanceId));
	}

	async getActiveLeases(port: number): Promise<HeadroomLease[]> {
		return await this.update((leases) => leases).then((leases) => leases.filter((entry) => entry.port === port));
	}

	private async update(mutator: (leases: HeadroomLease[]) => HeadroomLease[]): Promise<HeadroomLease[]> {
		await this.acquireLock();
		try {
			const leases = await this.readLeases();
			const activeLeases = leases.filter((lease) => isProcessAlive(lease.pid));
			const nextLeases = mutator(activeLeases);
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const tempPath = `${this.filePath}.${process.pid}.tmp`;
			await fs.writeFile(tempPath, JSON.stringify({ leases: nextLeases }, null, 2));
			await fs.rename(tempPath, this.filePath);
			return nextLeases;
		} finally {
			await this.releaseLock();
		}
	}

	private async readLeases(): Promise<HeadroomLease[]> {
		try {
			const raw = await fs.readFile(this.filePath, "utf8");
			const data = JSON.parse(raw) as { leases?: unknown };
			if (!Array.isArray(data.leases)) throw new Error(`Invalid Headroom lease file: expected leases array in ${this.filePath}`);
			return data.leases.filter(isLease);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
	}

	private async acquireLock(): Promise<void> {
		const startedAt = Date.now();
		while (true) {
			try {
				await fs.mkdir(path.dirname(this.lockPath), { recursive: true });
				await fs.mkdir(this.lockPath, { recursive: false });
				return;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				await this.removeStaleLock();
				if (Date.now() - startedAt > LOCK_TIMEOUT_MS) throw new Error(`Timed out acquiring Headroom lease lock: ${this.lockPath}`);
				await sleep(LOCK_RETRY_MS);
			}
		}
	}

	private async removeStaleLock(): Promise<void> {
		try {
			const stats = await fs.stat(this.lockPath);
			if (Date.now() - stats.mtimeMs <= LOCK_STALE_MS) return;
			await fs.rm(this.lockPath, { recursive: true, force: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}

	private async releaseLock(): Promise<void> {
		try {
			await fs.rm(this.lockPath, { recursive: true, force: true });
		} catch {
			// Lock cleanup is best-effort; stale-lock stealing recovers leftovers.
		}
	}
}

export function getProcessHeadroomRuntime(createProxy: CreateHeadroomProxy): HeadroomRuntime {
	const globalScope = globalThis as typeof globalThis & { [key: symbol]: HeadroomRuntime | undefined };
	if (!globalScope[PROCESS_RUNTIME_KEY]) {
		globalScope[PROCESS_RUNTIME_KEY] = new HeadroomRuntime(createProxy);
	} else {
		globalScope[PROCESS_RUNTIME_KEY].setCreateProxy(createProxy);
	}
	return globalScope[PROCESS_RUNTIME_KEY];
}

function defaultLeaseFilePath(): string {
	const stateHome = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state");
	return path.join(stateHome, "mypac", "headroom-leases.json");
}

function createInstanceId(): string {
	return `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isLease(value: unknown): value is HeadroomLease {
	const lease = value as Partial<HeadroomLease> | undefined;
	return Boolean(
		lease
			&& typeof lease.instanceId === "string"
			&& typeof lease.pid === "number"
			&& typeof lease.port === "number"
			&& isHeadroomMode(lease.mode)
			&& typeof lease.binary === "string"
			&& typeof lease.updatedAt === "number",
	);
}

function isHeadroomMode(value: unknown): value is HeadroomOptions["mode"] {
	return value === "token" || value === "cache";
}

function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
