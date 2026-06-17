import test from "node:test";
import assert from "node:assert/strict";

import { HEADROOM_FOOTER_STATE_EVENT, extractHeadroomSavings, parseHeadroomFooterState, publishHeadroomFooterState } from "./state.ts";

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
