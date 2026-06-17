import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildProviderOverrides, formatStatus, getInstallGuidance, parseHeadroomArgs, type HeadroomOptions } from "./helpers.ts";
import { HeadroomProxyManager } from "./proxy.ts";
import { getProcessHeadroomRuntime, HeadroomRuntime, type CreateHeadroomProxy, type HeadroomProxy } from "./runtime.ts";
import { extractHeadroomSavings, publishHeadroomFooterState, type HeadroomFooterState, type HeadroomFooterStatus } from "./state.ts";

const STATUS_KEY = "headroom";
const SUPPORTED_PROVIDERS = ["openai-codex", "openai", "anthropic"] as const;
const SESSION_HANDOFF_REASONS = new Set(["new", "resume", "fork"]);

type CommandContext = ExtensionCommandContext;
type HeadroomContext = Pick<ExtensionCommandContext, "hasUI" | "ui" | "model">;
type HeadroomStatus = "enabled" | "disabled" | "starting" | "error" | "routing_pending";
type CreateProxy = (options: HeadroomOptions) => HeadroomProxy;

function createManagedProxy(options: HeadroomOptions): HeadroomProxyManager {
	return new HeadroomProxyManager({ binary: options.binary, port: options.port, mode: options.mode });
}

export function registerHeadroomExtension(
	pi: ExtensionAPI,
	createProxy: CreateProxy = createManagedProxy,
	runtime: HeadroomRuntime = getProcessHeadroomRuntime(createProxy as CreateHeadroomProxy),
): void {
	runtime.setCreateProxy(createProxy as CreateHeadroomProxy);
	let providerOverridesRegistered = false;
	let lastFooterStatus: HeadroomFooterStatus = "not_started";

	function publishFooterState(state: HeadroomFooterState): void {
		lastFooterStatus = state.status;
		publishHeadroomFooterState(pi, state);
	}

	function setStatus(ctx: HeadroomContext, status: HeadroomStatus): void {
		if (!ctx.hasUI) return;
		const theme = ctx.ui.theme;
		if (status === "enabled") {
			ctx.ui.setStatus(STATUS_KEY, theme.fg("success", "✓") + theme.fg("dim", " Headroom"));
			return;
		}
		if (status === "starting") {
			ctx.ui.setStatus(STATUS_KEY, theme.fg("dim", "⏳ Headroom starting..."));
			return;
		}
		if (status === "routing_pending") {
			ctx.ui.setStatus(STATUS_KEY, theme.fg("warning", "⚠") + theme.fg("dim", " Headroom pending model switch"));
			return;
		}
		if (status === "error") {
			ctx.ui.setStatus(STATUS_KEY, theme.fg("warning", "⚠") + theme.fg("dim", " Headroom offline"));
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}

	function notify(ctx: HeadroomContext, message: string, level: "info" | "warning" | "error"): void {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	}

	function setWorkingMessage(ctx: HeadroomContext, message: string | undefined): void {
		if (!ctx.hasUI) return;
		ctx.ui.setWorkingMessage(message);
		ctx.ui.setWorkingVisible(Boolean(message));
	}

	function isRoutedProvider(provider: string): boolean {
		return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
	}

	async function reselectCurrentModel(ctx: HeadroomContext): Promise<boolean> {
		if (!ctx.model) return true;
		let failureDetail = "setModel returned false";
		try {
			const selected = await pi.setModel(ctx.model);
			if (selected) return true;
		} catch (error) {
			failureDetail = error instanceof Error ? error.message : String(error);
		}
		notify(ctx, `Note: could not reselect the current model (${failureDetail}); routing changes apply after the next model selection.`, "warning");
		return false;
	}

	async function applyProviderOverrides(port: number): Promise<void> {
		providerOverridesRegistered = true;
		for (const override of buildProviderOverrides(port)) {
			pi.registerProvider(override.provider, override.config);
		}
	}

	async function removeProviderOverrides(force = false): Promise<void> {
		if (!force && !providerOverridesRegistered) return;
		for (const provider of SUPPORTED_PROVIDERS) {
			pi.unregisterProvider(provider);
		}
		providerOverridesRegistered = false;
	}

	function isMissingBinaryError(error: Error): boolean {
		return (error as NodeJS.ErrnoException).code === "ENOENT";
	}

	function isSamePortReconfiguration(options: HeadroomOptions): boolean {
		return Boolean(
			runtime.isEnabled
				&& runtime.activeOptions
				&& runtime.activeOptions.port === options.port
				&& (runtime.activeOptions.mode !== options.mode || runtime.activeOptions.binary !== options.binary),
		);
	}

	async function publishHeadroomStats(proxy: HeadroomProxy, status: "working" | "error"): Promise<void> {
		try {
			const stats = await proxy.stats();
			if (proxy !== runtime.activeProxy || !runtime.isEnabled) return;
			publishFooterState({ status, ...extractHeadroomSavings(stats) });
		} catch {
			if (proxy !== runtime.activeProxy || !runtime.isEnabled) return;
			publishFooterState({ status });
		}
	}

	async function refreshHeadroomStats(status: "working" | "error" = lastFooterStatus === "error" ? "error" : "working"): Promise<void> {
		if (!runtime.isEnabled || !runtime.activeProxy) return;
		await publishHeadroomStats(runtime.activeProxy, status);
	}

	async function restoreProviderOverridesAfterFailure(ctx: HeadroomContext): Promise<void> {
		try {
			if (runtime.isEnabled && runtime.activeOptions) {
				await applyProviderOverrides(runtime.activeOptions.port);
			} else {
				await removeProviderOverrides(true);
			}
		} catch (error) {
			const failureDetail = error instanceof Error ? error.message : String(error);
			notify(ctx, `Failed to restore Headroom routing: ${failureDetail}`, "error");
		}
	}

	async function handleWrap(options: HeadroomOptions, ctx: CommandContext): Promise<void> {
		setStatus(ctx, "starting");
		notify(ctx, `Starting Headroom proxy on port ${options.port}...`, "info");
		setWorkingMessage(ctx, "Starting Headroom proxy...");
		try {
			await ctx.waitForIdle();

			if (isSamePortReconfiguration(options)) {
				notify(ctx, "Headroom is already enabled on this port with different mode or binary settings; run `/headroom stop` first or choose a different port.", "error");
				setStatus(ctx, "enabled");
				return;
			}

			const attempt = runtime.prepareWrap(options);
			const result = await attempt.proxy.ensureRunning((message) => {
				if (ctx.hasUI) {
					ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", `⏳ ${message}`));
					setWorkingMessage(ctx, message);
				}
			});

			if (!result.ok) {
				await runtime.abandonFailedWrap(attempt);
				const keepExistingRouting = runtime.isEnabled && attempt.shouldReplaceProxy;
				if (!keepExistingRouting) {
					await removeProviderOverrides();
					await runtime.clearRoutingState();
					publishFooterState({ status: "not_started" });
					await reselectCurrentModel(ctx);
				}
				setStatus(ctx, keepExistingRouting ? "enabled" : "error");
				if (!keepExistingRouting) publishFooterState({ status: "error" });
				const message = isMissingBinaryError(result.error)
					? getInstallGuidance(options.binary)
					: `Failed to start Headroom proxy: ${result.error.message}`;
				notify(ctx, message, "error");
				return;
			}

			try {
				await applyProviderOverrides(options.port);
				await runtime.commitWrap(options, attempt);
			} catch (error) {
				await runtime.abandonFailedWrap(attempt);
				await restoreProviderOverridesAfterFailure(ctx);
				const failureDetail = error instanceof Error ? error.message : String(error);
				notify(ctx, `Failed to register Headroom routing: ${failureDetail}`, "error");
				setStatus(ctx, runtime.isEnabled ? "enabled" : "error");
				return;
			}
			const routingApplied = await reselectCurrentModel(ctx);
			setStatus(ctx, routingApplied ? "enabled" : "routing_pending");
			await publishHeadroomStats(attempt.proxy, "working");
			const details = [
				`Headroom enabled on ${attempt.proxy.baseUrl}`,
				"Routed providers: openai-codex, openai, anthropic",
				`Proxy: ${result.managed ? "managed by this Pi session" : "externally detected"}`,
			];
			if (ctx.model?.provider && !isRoutedProvider(ctx.model.provider)) {
				details.push(`Current provider is ${ctx.model.provider}; switch to a routed provider to send traffic through Headroom.`);
			}
			notify(ctx, details.join("\n"), "info");
		} finally {
			setWorkingMessage(ctx, undefined);
		}
	}

	async function handleStop(ctx: CommandContext): Promise<void> {
		await ctx.waitForIdle();
		const wasEnabled = runtime.isEnabled;
		await removeProviderOverrides();
		publishFooterState({ status: "not_started" });
		await runtime.stop();
		if (wasEnabled) await reselectCurrentModel(ctx);
		setStatus(ctx, "disabled");
		if (wasEnabled) notify(ctx, "Headroom disabled; provider routing restored.", "info");
	}

	async function handleStatus(options: HeadroomOptions, ctx: CommandContext): Promise<void> {
		const proxy = runtime.activeProxy ?? createProxy(options);
		const [health, stats] = await Promise.all([
			proxy.health().catch(() => undefined),
			proxy.stats().catch(() => undefined),
		]);
		if (runtime.isEnabled && proxy === runtime.activeProxy) {
			const nextFooterStatus = health ? "working" : "error";
			publishFooterState(stats ? { status: nextFooterStatus, ...extractHeadroomSavings(stats) } : { status: nextFooterStatus });
		}
		notify(
			ctx,
			formatStatus({
				enabled: runtime.isEnabled,
				managed: proxy.isManaged,
				baseUrl: proxy.baseUrl,
				health,
				stats,
			}),
			health ? "info" : "warning",
		);
	}

	pi.registerCommand("headroom", {
		description: "Route Pi providers through Headroom. Usage: /headroom wrap|stop|status [--port <port>] [--mode token|cache] [--bin <headroom>]",
		handler: async (args, ctx) => {
			let options: HeadroomOptions;
			try {
				options = parseHeadroomArgs(args);
			} catch (error) {
				notify(ctx, error instanceof Error ? error.message : String(error), "error");
				return;
			}

			if (options.action === "wrap") {
				await handleWrap(options, ctx);
				return;
			}
			if (options.action === "stop") {
				await handleStop(ctx);
				return;
			}
			await handleStatus(options, ctx);
		},
	});

	pi.on("turn_end", async () => {
		await refreshHeadroomStats();
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!runtime.isEnabled || !runtime.activeOptions || !runtime.activeProxy) return;
		try {
			await applyProviderOverrides(runtime.activeOptions.port);
			const routingApplied = await reselectCurrentModel(ctx);
			setStatus(ctx, routingApplied ? "enabled" : "routing_pending");
			await publishHeadroomStats(runtime.activeProxy, "working");
		} catch (error) {
			const failureDetail = error instanceof Error ? error.message : String(error);
			notify(ctx, `Failed to restore Headroom routing: ${failureDetail}`, "error");
			setStatus(ctx, "error");
			publishFooterState({ status: "error" });
		}
	});

	pi.on("session_shutdown", async (event) => {
		await removeProviderOverrides();
		publishFooterState({ status: "not_started" });
		if (SESSION_HANDOFF_REASONS.has(event?.reason)) return;
		await runtime.stop();
	});
}

export default function (pi: ExtensionAPI): void {
	registerHeadroomExtension(pi);
}
