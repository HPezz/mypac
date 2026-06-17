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

export interface HeadroomWrapAttempt {
	proxy: HeadroomProxy;
	previousProxy: HeadroomProxy | null;
	shouldReplaceProxy: boolean;
}

const PROCESS_RUNTIME_KEY = Symbol.for("mypac.headroom.runtime");

export class HeadroomRuntime {
	private enabled = false;
	private proxy: HeadroomProxy | null = null;
	private options: HeadroomOptions | null = null;
	private createProxy: CreateHeadroomProxy;

	constructor(createProxy: CreateHeadroomProxy) {
		this.createProxy = createProxy;
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
			shouldReplaceProxy,
		};
	}

	async commitWrap(options: HeadroomOptions, attempt: HeadroomWrapAttempt): Promise<void> {
		if (attempt.shouldReplaceProxy) {
			this.proxy = attempt.proxy;
			this.options = options;
			if (attempt.previousProxy && attempt.previousProxy !== attempt.proxy) {
				await attempt.previousProxy.stop();
			}
		}
		this.enabled = true;
	}

	async abandonFailedWrap(attempt: HeadroomWrapAttempt): Promise<void> {
		if (attempt.shouldReplaceProxy) await attempt.proxy.stop();
	}

	clearRoutingState(): void {
		this.enabled = false;
		this.proxy = null;
		this.options = null;
	}

	async stop(): Promise<void> {
		const proxy = this.proxy;
		this.clearRoutingState();
		if (proxy) await proxy.stop();
	}

	private optionsChanged(options: HeadroomOptions): boolean {
		return !this.options || this.options.port !== options.port || this.options.mode !== options.mode || this.options.binary !== options.binary;
	}
}

export function getProcessHeadroomRuntime(createProxy: CreateHeadroomProxy): HeadroomRuntime {
	const globalScope = globalThis as typeof globalThis & { [PROCESS_RUNTIME_KEY]?: HeadroomRuntime };
	if (!globalScope[PROCESS_RUNTIME_KEY]) {
		globalScope[PROCESS_RUNTIME_KEY] = new HeadroomRuntime(createProxy);
	} else {
		globalScope[PROCESS_RUNTIME_KEY].setCreateProxy(createProxy);
	}
	return globalScope[PROCESS_RUNTIME_KEY];
}
