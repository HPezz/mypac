import test from "node:test";
import assert from "node:assert/strict";

import {
	HEADROOM_FOOTER_STATE_EVENT,
	didHeadroomStatsCountersReset,
	extractHeadroomSavings,
	extractHeadroomStatsSnapshot,
	extractSessionHeadroomSavings,
	parseHeadroomFooterState,
	publishHeadroomFooterState,
} from "./state.ts";

test("headroom footer state publishes on the shared event bus", () => {
	const emitted = [];
	const pi = {
		events: {
			emit: (channel, data) => emitted.push({ channel, data }),
		},
	};

	publishHeadroomFooterState(pi, { status: "working", tokensSaved: 42, compressionPercent: 12.5 });

	assert.deepEqual(emitted, [{ channel: HEADROOM_FOOTER_STATE_EVENT, data: { status: "working", tokensSaved: 42, compressionPercent: 12.5 } }]);
});

test("headroom footer state parser accepts status payloads and legacy enabled payloads", () => {
	assert.deepEqual(parseHeadroomFooterState({ status: "working", tokensSaved: 42, compressionPercent: 12.5 }), { status: "working", tokensSaved: 42, compressionPercent: 12.5 });
	assert.deepEqual(parseHeadroomFooterState({ status: "error" }), { status: "error", tokensSaved: undefined, compressionPercent: undefined });
	assert.deepEqual(parseHeadroomFooterState({ enabled: false }), { status: "not_started", tokensSaved: undefined, compressionPercent: undefined });
	assert.equal(parseHeadroomFooterState({ status: "unknown" }), null);
});

test("headroom footer state extracts savings from stats summary", () => {
	assert.deepEqual(extractHeadroomSavings({ summary: { compression: { total_tokens_removed: 1234, avg_compression_pct: 17.6 } } }), {
		tokensSaved: 1234,
		compressionPercent: 17.6,
	});
	assert.deepEqual(extractHeadroomSavings({}), { tokensSaved: undefined, compressionPercent: undefined });
});

test("headroom footer state extracts monotonic token counters", () => {
	assert.deepEqual(extractHeadroomStatsSnapshot({ tokens: { input: 800, saved: 200 } }), {
		inputTokens: 800,
		savedTokens: 200,
	});
	assert.deepEqual(extractHeadroomStatsSnapshot({ summary: { compression: { total_tokens_removed: 200 } } }), {
		inputTokens: undefined,
		savedTokens: 200,
	});
	assert.equal(extractHeadroomStatsSnapshot({}), null);
});

test("headroom footer state derives session savings from counter deltas", () => {
	const baseline = extractHeadroomStatsSnapshot({
		tokens: { input: 10_000, saved: 2_000 },
		summary: { compression: { avg_compression_pct: 50 } },
	});

	assert.deepEqual(extractSessionHeadroomSavings({ tokens: { input: 10_800, saved: 2_200 }, summary: { compression: { avg_compression_pct: 5 } } }, baseline), {
		tokensSaved: 200,
		compressionPercent: 20,
	});
});

test("headroom footer state detects reset monotonic counters", () => {
	const baseline = extractHeadroomStatsSnapshot({ tokens: { input: 10_000, saved: 2_000 } });

	assert.equal(didHeadroomStatsCountersReset(extractHeadroomStatsSnapshot({ tokens: { input: 100, saved: 10 } }), baseline), true);
	assert.equal(didHeadroomStatsCountersReset(extractHeadroomStatsSnapshot({ tokens: { input: 10_100, saved: 2_010 } }), baseline), false);
});
