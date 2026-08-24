import test from "node:test";
import assert from "node:assert/strict";
import notifyExtension from "./index.ts";
import { extractLastAssistantText, formatNotification, formatTerminalNotification } from "./helpers.ts";

test("RPC mode uses protocol notifications instead of terminal escape output", async () => {
	const commands = new Map();
	const events = new Map();
	const notifications = [];
	notifyExtension({
		registerCommand: (name, definition) => commands.set(name, definition.handler),
		on: (event, handler) => events.set(event, handler),
	});
	const ctx = {
		mode: "rpc",
		hasUI: true,
		ui: { notify: (message, level) => notifications.push({ message, level }) },
	};

	await commands.get("notify-test")("", ctx);
	await events.get("agent_end")({ messages: [{ role: "assistant", content: "Done" }] }, ctx);

	assert.deepEqual(notifications, [
		{ message: "Pi test: Ready for input", level: "info" },
		{ message: "π: Done", level: "info" },
	]);
});

test("extracts the last assistant string content", () => {
	const text = extractLastAssistantText([
		{ role: "assistant", content: "first" },
		{ role: "user", content: "question" },
		{ role: "assistant", content: "  final answer  " },
	]);

	assert.equal(text, "final answer");
});

test("extracts text parts from the last assistant array content", () => {
	const text = extractLastAssistantText([
		{
			role: "assistant",
			content: [
				{ type: "thinking", text: "ignore me" },
				{ type: "text", text: "line one" },
				{ type: "text", text: "line two" },
			],
		},
	]);

	assert.equal(text, "line one\nline two");
});

test("returns null when no assistant text is available", () => {
	assert.equal(extractLastAssistantText([{ role: "user", content: "hello" }]), null);
	assert.equal(extractLastAssistantText([{ role: "assistant", content: "   " }]), null);
});

test("skips assistant messages without extractable text", () => {
	const text = extractLastAssistantText([
		{ role: "assistant", content: "usable answer" },
		{ role: "assistant", content: [{ type: "tool-call", name: "bash" }] },
		{ role: "assistant", content: { type: "other" } },
	]);

	assert.equal(text, "usable answer");
});

test("formats empty text as a ready-for-input notification", () => {
	assert.deepEqual(formatNotification(null), { title: "Ready for input", body: "" });
});

test("formats markdown-like assistant text as a normalized notification body", () => {
	const notification = formatNotification("## Done\n\nThis is **ready** now.\n\n- Item one\n- Item two");

	assert.equal(notification.title, "π");
	assert.equal(notification.body, "Done This is ready now. Item one Item two");
});

test("truncates long notification bodies", () => {
	const notification = formatNotification("x".repeat(250));

	assert.equal(notification.body.length, 200);
	assert.equal(notification.body.endsWith("…"), true);
});

test("formats iTerm2 notifications with OSC 9", () => {
	assert.equal(
		formatTerminalNotification("Pi test", "Ready for input", { TERM_PROGRAM: "iTerm.app" }),
		"\x1b]9;Pi test: Ready for input\x07",
	);
});

test("formats default notifications with OSC 777", () => {
	assert.equal(
		formatTerminalNotification("π", "Ready for input", {}),
		"\x1b]777;notify;π;Ready for input\x07",
	);
});

test("detects iTerm2 from ITERM_SESSION_ID", () => {
	assert.equal(
		formatTerminalNotification("Pi test", "Ready for input", { ITERM_SESSION_ID: "session" }),
		"\x1b]9;Pi test: Ready for input\x07",
	);
});

test("formats Kitty notifications with OSC 99", () => {
	assert.equal(
		formatTerminalNotification("Pi test", "Ready for input", { KITTY_WINDOW_ID: "1" }),
		"\x1b]99;i=1:d=0;Pi test\x1b\\\x1b]99;i=1:p=body;Ready for input\x1b\\",
	);
});

test("wraps notifications for tmux passthrough", () => {
	assert.equal(
		formatTerminalNotification("Pi test", "Ready for input", { TERM_PROGRAM: "iTerm.app", TMUX: "/tmp/tmux" }),
		"\x1bPtmux;\x1b\x1b]9;Pi test: Ready for input\x07\x1b\\",
	);
});

test("sanitizes notification fields before formatting OSC sequences", () => {
	assert.equal(
		formatTerminalNotification("P;i\x07", "Ready\x1b]9;bad\x07;done", {}),
		"\x1b]777;notify;P,i;Ready]9,bad,done\x07",
	);
	assert.equal(
		formatTerminalNotification("P;i\x07", "Ready\x1b]9;bad\x07;done", { TERM_PROGRAM: "iTerm.app" }),
		"\x1b]9;P,i: Ready]9,bad,done\x07",
	);
	assert.equal(
		formatTerminalNotification("P;i\x07", "Ready\x1b]9;bad\x07;done", { KITTY_WINDOW_ID: "1" }),
		"\x1b]99;i=1:d=0;P,i\x1b\\\x1b]99;i=1:p=body;Ready]9,bad,done\x1b\\",
	);
});
