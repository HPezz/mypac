import { spawn, type ChildProcess } from "node:child_process";
import { buildProxyArgs, type HeadroomMode } from "./helpers.ts";

export interface HeadroomProxyOptions {
	binary: string;
	port: number;
	mode: HeadroomMode;
	host?: string;
}

export interface HeadroomProxyOperations {
	spawn: (command: string, args: string[], options: { stdio: "ignore"; detached: boolean }) => ManagedProcess;
	fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
	sleep: (ms: number) => Promise<void>;
}

export interface ManagedProcess {
	exitCode: number | null;
	kill: (signal?: NodeJS.Signals) => boolean;
	on: (event: "error" | "exit", listener: (...args: any[]) => void) => ManagedProcess;
	unref?: () => void;
}

const STARTUP_DELAYS_MS = [250, 500, 1000, 1000, 1500, 2000, 2000, 2000];

export class HeadroomProxyManager {
	private process: ManagedProcess | null = null;
	private managed = false;
	private startupError: Error | null = null;
	private options: HeadroomProxyOptions;
	private operations: HeadroomProxyOperations;

	constructor(options: HeadroomProxyOptions, operations: Partial<HeadroomProxyOperations> = {}) {
		this.options = { ...options, host: options.host ?? "127.0.0.1" };
		this.operations = { ...defaultOperations, ...operations };
	}

	get baseUrl(): string {
		return `http://${this.options.host}:${this.options.port}`;
	}

	get isManaged(): boolean {
		return this.managed;
	}

	updateOptions(options: HeadroomProxyOptions): void {
		this.options = { ...options, host: options.host ?? "127.0.0.1" };
	}

	async ensureRunning(onStatus?: (message: string) => void): Promise<{ ok: true; managed: boolean } | { ok: false; error: Error }> {
		if (await this.isHealthy()) {
			return { ok: true, managed: this.managed };
		}
		if (this.process && this.managed) {
			onStatus?.("Stopping unhealthy Headroom proxy...");
			await this.stop();
		}

		try {
			onStatus?.("Starting Headroom proxy...");
			this.start();
		} catch (error) {
			return { ok: false, error: toError(error) };
		}

		for (const delay of STARTUP_DELAYS_MS) {
			await this.operations.sleep(delay);
			if (this.startupError) {
				const error = this.startupError;
				this.clearManagedProcess();
				return { ok: false, error };
			}
			if (await this.isHealthy()) {
				if (this.process?.exitCode === null) {
					this.managed = true;
					return { ok: true, managed: true };
				}
				this.clearManagedProcess();
				return { ok: true, managed: false };
			}
			if (this.process?.exitCode !== null) {
				const error = new Error("Headroom proxy exited before becoming healthy");
				this.clearManagedProcess();
				return { ok: false, error };
			}
		}

		await this.stop();
		return { ok: false, error: new Error("Headroom proxy did not become healthy before timeout") };
	}

	async isHealthy(): Promise<boolean> {
		try {
			await this.health();
			return true;
		} catch {
			return false;
		}
	}

	health(): Promise<unknown> {
		return this.operations.fetchJson(`${this.baseUrl}/health`, 3000);
	}

	stats(): Promise<unknown> {
		return this.operations.fetchJson(`${this.baseUrl}/stats`, 3000);
	}

	async stop(): Promise<void> {
		if (!this.process || !this.managed) {
			this.clearManagedProcess();
			return;
		}

		const child = this.process;
		this.clearManagedProcess();
		try {
			child.kill(process.platform === "win32" ? undefined : "SIGTERM");
		} catch {
			// The child may exit between our state check and signal delivery (for example ESRCH); stop() is best-effort.
		}
		await this.operations.sleep(250);
		if (child.exitCode === null) {
			try {
				child.kill(process.platform === "win32" ? undefined : "SIGKILL");
			} catch {
				// Same race as SIGTERM: a process that exited during escalation is already stopped.
			}
		}
	}

	private start(): void {
		this.startupError = null;
		const child = this.operations.spawn(this.options.binary, buildProxyArgs(this.options), {
			stdio: "ignore",
			detached: false,
		});
		child.on("error", (error) => {
			this.startupError = toError(error);
		});
		child.on("exit", () => {
			if (this.process === child) this.clearManagedProcess();
		});
		child.unref?.();
		this.process = child;
		this.managed = true;
	}

	private clearManagedProcess(): void {
		this.process = null;
		this.managed = false;
		this.startupError = null;
	}
}

const defaultOperations: HeadroomProxyOperations = {
	spawn: (command, args, options) => spawn(command, args, options) as ChildProcess as ManagedProcess,
	fetchJson: async (url, timeoutMs) => {
		const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return response.json();
	},
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
