import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type HeadroomFooterStatus = "working" | "error" | "not_started";

export interface HeadroomFooterState {
	status: HeadroomFooterStatus;
	tokensSaved?: number;
	compressionPercent?: number;
}

export interface HeadroomStatsSnapshot {
	inputTokens?: number;
	savedTokens?: number;
}

export const HEADROOM_FOOTER_STATE_EVENT = "headroom:footer-state";

export function publishHeadroomFooterState(pi: Pick<ExtensionAPI, "events">, state: HeadroomFooterState): void {
	pi.events.emit(HEADROOM_FOOTER_STATE_EVENT, state);
}

export function parseHeadroomFooterState(data: unknown): HeadroomFooterState | null {
	if (!data || typeof data !== "object") return null;
	const input = data as { status?: unknown; tokensSaved?: unknown; compressionPercent?: unknown; enabled?: unknown };
	let status: HeadroomFooterStatus | null = null;
	if (input.status === "working" || input.status === "error" || input.status === "not_started") status = input.status;
	if (!status && typeof input.enabled === "boolean") status = input.enabled ? "working" : "not_started";
	if (!status) return null;
	return {
		status,
		tokensSaved: typeof input.tokensSaved === "number" ? input.tokensSaved : undefined,
		compressionPercent: typeof input.compressionPercent === "number" ? input.compressionPercent : undefined,
	};
}

export function extractHeadroomSavings(stats: unknown): Pick<HeadroomFooterState, "tokensSaved" | "compressionPercent"> {
	const compression = (stats as { summary?: { compression?: { total_tokens_removed?: unknown; avg_compression_pct?: unknown } } } | undefined)?.summary?.compression;
	return {
		tokensSaved: typeof compression?.total_tokens_removed === "number" ? compression.total_tokens_removed : undefined,
		compressionPercent: typeof compression?.avg_compression_pct === "number" ? compression.avg_compression_pct : undefined,
	};
}

export function extractHeadroomStatsSnapshot(stats: unknown): HeadroomStatsSnapshot | null {
	const input = stats as {
		tokens?: { input?: unknown; saved?: unknown };
		summary?: { compression?: { total_tokens_removed?: unknown } };
	} | undefined;
	const tokens = input?.tokens;
	const compression = input?.summary?.compression;
	const inputTokens = typeof tokens?.input === "number" ? tokens.input : undefined;
	const savedTokens = typeof tokens?.saved === "number"
		? tokens.saved
		: typeof compression?.total_tokens_removed === "number"
			? compression.total_tokens_removed
			: undefined;
	if (inputTokens === undefined && savedTokens === undefined) return null;
	return { inputTokens, savedTokens };
}

export function extractSessionHeadroomSavings(stats: unknown, baseline: HeadroomStatsSnapshot | null): Pick<HeadroomFooterState, "tokensSaved" | "compressionPercent"> {
	const current = extractHeadroomStatsSnapshot(stats);
	if (!current || !baseline) return { tokensSaved: undefined, compressionPercent: undefined };
	const tokensSaved = calculateDelta(current.savedTokens, baseline.savedTokens);
	const inputTokens = calculateDelta(current.inputTokens, baseline.inputTokens);
	const totalOriginalTokens = tokensSaved !== undefined && inputTokens !== undefined ? tokensSaved + inputTokens : undefined;
	return {
		tokensSaved,
		compressionPercent: totalOriginalTokens !== undefined && tokensSaved !== undefined
			? totalOriginalTokens > 0 ? (tokensSaved / totalOriginalTokens) * 100 : 0
			: undefined,
	};
}

export function didHeadroomStatsCountersReset(current: HeadroomStatsSnapshot | null, baseline: HeadroomStatsSnapshot | null): boolean {
	if (!current || !baseline) return false;
	return didCounterReset(current.savedTokens, baseline.savedTokens) || didCounterReset(current.inputTokens, baseline.inputTokens);
}

function didCounterReset(current: number | undefined, baseline: number | undefined): boolean {
	return current !== undefined && baseline !== undefined && current < baseline;
}

function calculateDelta(current: number | undefined, baseline: number | undefined): number | undefined {
	if (current === undefined || baseline === undefined) return undefined;
	return Math.max(0, current - baseline);
}
