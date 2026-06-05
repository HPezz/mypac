import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildProviderOverrides, formatStatus, getInstallGuidance, parseHeadroomArgs, type HeadroomOptions } from "./helpers.ts";
import { HeadroomProxyManager } from "./proxy.ts";

const STATUS_KEY = "headroom";
const SUPPORTED_PROVIDERS = ["openai-codex", "openai", "anthropic"] as const;

type CommandContext = ExtensionCommandContext;
type HeadroomStatus = "enabled" | "disabled" | "starting" | "error" | "routing_pending";
type CreateProxy = (options: HeadroomOptions) => HeadroomProxyManager;

function createManagedProxy(options: HeadroomOptions): HeadroomProxyManager {
	return new HeadroomProxyManager({ binary: options.binary, port: options.port, mode: options.mode });
}

export function registerHeadroomExtension(pi: ExtensionAPI, createProxy: CreateProxy = createManagedProxy): void {
	let enabled = false;
	let manager: HeadroomProxyManager | null = null;
	let managerOptions: HeadroomOptions | null = null;
	let providerOverridesRegistered = false;

	function setStatus(ctx: CommandContext, status: HeadroomStatus): void {
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

	function notify(ctx: CommandContext, message: string, level: "info" | "warning" | "error" = "info"): void {
		ctx.ui.notify(message, level);
	}

	function setWorkingMessage(ctx: CommandContext, message: string | undefined): void {
		if (!ctx.hasUI) return;
		ctx.ui.setWorkingMessage(message);
		ctx.ui.setWorkingVisible(message !== undefined);
	}

	function isRoutedProvider(provider: string | undefined): boolean {
		return !!provider && (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
	}

	async function reselectCurrentModel(ctx: CommandContext): Promise<boolean> {
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
		for (const override of buildProviderOverrides(port)) {
			pi.registerProvider(override.provider, override.config);
		}
		providerOverridesRegistered = true;
	}

	async function removeProviderOverrides(): Promise<void> {
		if (!providerOverridesRegistered) return;
		for (const provider of SUPPORTED_PROVIDERS) {
			pi.unregisterProvider(provider);
		}
		providerOverridesRegistered = false;
	}

	function optionsChanged(options: HeadroomOptions): boolean {
		return !managerOptions || managerOptions.port !== options.port || managerOptions.mode !== options.mode || managerOptions.binary !== options.binary;
	}

	function isMissingBinaryError(error: Error): boolean {
		return (error as NodeJS.ErrnoException).code === "ENOENT";
	}

	async function handleWrap(options: HeadroomOptions, ctx: CommandContext): Promise<void> {
		setStatus(ctx, "starting");
		notify(ctx, `Starting Headroom proxy on port ${options.port}...`, "info");
		setWorkingMessage(ctx, "Starting Headroom proxy...");
		try {
			await ctx.waitForIdle();

			const previousManager = manager;
			const shouldReplaceManager = !manager || optionsChanged(options);
			const proxy = shouldReplaceManager ? createProxy(options) : manager!;
			const result = await proxy.ensureRunning((message) => {
				if (ctx.hasUI) {
					ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", `⏳ ${message}`));
					setWorkingMessage(ctx, message);
				}
			});

			if (!result.ok) {
				if (shouldReplaceManager) await proxy.stop();
				const keepExistingRouting = enabled && shouldReplaceManager;
				if (!keepExistingRouting) {
					await removeProviderOverrides();
					enabled = false;
					manager = null;
					managerOptions = null;
					await reselectCurrentModel(ctx);
				}
				setStatus(ctx, keepExistingRouting ? "enabled" : "error");
				const message = isMissingBinaryError(result.error)
					? getInstallGuidance(options.binary)
					: `Failed to start Headroom proxy: ${result.error.message}`;
				notify(ctx, message, "error");
				return;
			}

			if (shouldReplaceManager) {
				manager = proxy;
				managerOptions = options;
				if (previousManager && previousManager !== proxy) await previousManager.stop();
			}

			await applyProviderOverrides(options.port);
			enabled = true;
			const routingApplied = await reselectCurrentModel(ctx);
			setStatus(ctx, routingApplied ? "enabled" : "routing_pending");
			const details = [
				`Headroom enabled on ${proxy.baseUrl}`,
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
		const wasEnabled = enabled;
		await removeProviderOverrides();
		enabled = false;
		if (manager) await manager.stop();
		manager = null;
		managerOptions = null;
		if (wasEnabled) await reselectCurrentModel(ctx);
		setStatus(ctx, "disabled");
		if (wasEnabled) notify(ctx, "Headroom disabled; provider routing restored.", "info");
	}

	async function handleStatus(options: HeadroomOptions, ctx: CommandContext): Promise<void> {
		const proxy = manager ?? createProxy(options);
		const [health, stats] = await Promise.all([
			proxy.health().catch(() => undefined),
			proxy.stats().catch(() => undefined),
		]);
		notify(
			ctx,
			formatStatus({
				enabled,
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

	pi.on("session_shutdown", async () => {
		await removeProviderOverrides();
		enabled = false;
		if (manager) await manager.stop();
		manager = null;
		managerOptions = null;
	});
}

export default function (pi: ExtensionAPI): void {
	registerHeadroomExtension(pi);
}
