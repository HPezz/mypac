import test from "node:test";
import assert from "node:assert/strict";

import registerFooterExtension from "./index.ts";
import { HEADROOM_FOOTER_STATE_EVENT } from "../headroom/state.ts";

function createEventBus() {
	const handlers = new Map();
	return {
		emit(channel, data) {
			for (const handler of handlers.get(channel) ?? []) handler(data);
		},
		on(channel, handler) {
			const list = handlers.get(channel) ?? [];
			list.push(handler);
			handlers.set(channel, list);
			return () => handlers.set(channel, (handlers.get(channel) ?? []).filter((item) => item !== handler));
		},
	};
}

function createHarness(mode = "tui") {
	const events = new Map();
	let footerFactory;
	let footerCalls = 0;
	let renderRequests = 0;
	const eventBus = createEventBus();
	const pi = {
		events: eventBus,
		on: (event, handler) => events.set(event, handler),
		getThinkingLevel: () => "medium",
	};
	const ctx = {
		mode,
		hasUI: mode === "tui" || mode === "rpc",
		model: { provider: "openai-codex", id: "gpt-5.5", reasoning: true },
		modelRegistry: { isUsingOAuth: () => false },
		getContextUsage: () => undefined,
		sessionManager: {
			getCwd: () => "/repo",
			getSessionId: () => "abc123456789",
			getSessionName: () => undefined,
			getEntries: () => [],
		},
		ui: {
			setFooter: (factory) => {
				footerCalls++;
				footerFactory = factory;
			},
		},
	};
	const footerData = {
		getGitBranch: () => "main",
		onBranchChange: () => () => {},
	};
	const tui = { requestRender: () => { renderRequests++; } };
	const theme = { fg: (_color, text) => text };

	registerFooterExtension(pi);
	events.get("session_start")({ type: "session_start" }, ctx);
	const footer = footerFactory?.(tui, theme, footerData);

	return { eventBus, footer, footerCalls, get renderRequests() { return renderRequests; } };
}

test("footer updates Headroom indicator from shared event bus", () => {
	const harness = createHarness();

	assert.match(harness.footer.render(80).join("\n"), /Headroom - \(0\/0%\)/);

	harness.eventBus.emit(HEADROOM_FOOTER_STATE_EVENT, { status: "working", tokensSaved: 1234, compressionPercent: 17.6 });

	assert.equal(harness.renderRequests, 1);
	assert.match(harness.footer.render(80).join("\n"), /Headroom ✓ \(1\.2k\/18%\)/);
	harness.footer.dispose();
});

test("footer does not install a component factory in RPC mode", () => {
	const harness = createHarness("rpc");

	assert.equal(harness.footerCalls, 0);
	assert.equal(harness.footer, undefined);
});
