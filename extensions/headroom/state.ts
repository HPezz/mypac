import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type HeadroomFooterStatus = "working" | "error" | "not_started";

export interface HeadroomFooterState {
	status: HeadroomFooterStatus;
	tokensSaved?: number;
	compressionPercent?: number;
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
