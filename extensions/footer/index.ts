import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { FooterHeadroomState, FooterProviderUsage } from "./helpers.ts";
import { renderFooterLines, sumUsageFromEntries } from "./helpers.ts";
import { HEADROOM_FOOTER_STATE_EVENT, parseHeadroomFooterState } from "../headroom/state.ts";
import { detectUsageProvider, fetchProviderUsage } from "./usage.ts";

const USAGE_REFRESH_INTERVAL_MS = 5 * 60_000;

function isUsingSubscription(ctx: any): boolean {
	if (!ctx.model) return false;
	try {
		return Boolean(ctx.modelRegistry.isUsingOAuth(ctx.model));
	} catch {
		return false;
	}
}

export default function (pi: ExtensionAPI) {
	let latestUsage: FooterProviderUsage | null = null;
	let activeUsageProvider: ReturnType<typeof detectUsageProvider> = null;
	let tuiRef: { requestRender: () => void } | null = null;
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	let headroomState: FooterHeadroomState = { status: "not_started" };

	function stopRefreshTimer(): void {
		if (!refreshTimer) return;
		clearInterval(refreshTimer);
		refreshTimer = null;
	}

	function refreshUsage(modelProvider: string | undefined): void {
		const usageProvider = detectUsageProvider(modelProvider);
		activeUsageProvider = usageProvider;
		if (!usageProvider) {
			latestUsage = null;
			stopRefreshTimer();
			tuiRef?.requestRender();
			return;
		}

		fetchProviderUsage(usageProvider)
			.then((usage) => {
				if (activeUsageProvider !== usageProvider) return;
				latestUsage = usage;
				tuiRef?.requestRender();
			})
			.catch(() => {});
	}

	function refreshActiveUsage(): void {
		const usageProvider = activeUsageProvider;
		if (!usageProvider) return;
		fetchProviderUsage(usageProvider)
			.then((usage) => {
				if (activeUsageProvider !== usageProvider) return;
				latestUsage = usage;
				tuiRef?.requestRender();
			})
			.catch(() => {});
	}

	function startRefreshTimer(): void {
		stopRefreshTimer();
		if (!activeUsageProvider) return;
		refreshTimer = setInterval(refreshActiveUsage, USAGE_REFRESH_INTERVAL_MS);
	}

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			tuiRef = tui;
			refreshUsage(ctx.model?.provider);
			startRefreshTimer();
			const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
			const unsubscribeHeadroom = pi.events.on(HEADROOM_FOOTER_STATE_EVENT, (data) => {
				const state = parseHeadroomFooterState(data);
				if (!state) return;
				headroomState = state;
				tui.requestRender();
			});

			return {
				dispose: () => {
					unsubscribeBranch();
					unsubscribeHeadroom();
					tuiRef = null;
					stopRefreshTimer();
				},
				invalidate() {},
				render(width: number): string[] {
					return renderFooterLines(
						{
							cwd: ctx.sessionManager.getCwd(),
							branch: footerData.getGitBranch(),
							sessionId: ctx.sessionManager.getSessionId(),
							sessionName: ctx.sessionManager.getSessionName(),
							usage: sumUsageFromEntries(ctx.sessionManager.getEntries()),
							usingSubscription: isUsingSubscription(ctx),
							model: ctx.model,
							thinkingLevel: pi.getThinkingLevel(),
							contextUsage: ctx.getContextUsage(),
							providerUsage: latestUsage,
							headroomState,
						},
						width,
						theme,
					);
				},
			};
		});
	});

	pi.on("model_select", (event) => {
		refreshUsage(event.model?.provider);
		startRefreshTimer();
	});
}
