import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	formatLocationLine,
	formatModelName,
	formatSessionLine,
	formatStatusSegment,
	getBudgetColor,
	getContextColor,
	renderFooterLines,
	renderProviderUsageLines,
	sumUsageFromEntries,
} from "./helpers.ts";

test("formatStatusSegment keeps compact token/cache/cost shape", () => {
	assert.equal(
		formatStatusSegment(
			{ input: 183_000, output: 12_000, cacheRead: 682_000, cacheWrite: 3_400, totalCost: 1.621 },
			true,
		),
		"↑183k ↓12k R682k W3.4k $1.621 (sub)",
	);
});

test("formatStatusSegment omits write cache when zero", () => {
	assert.equal(
		formatStatusSegment(
			{ input: 216_000, output: 12_000, cacheRead: 3_300_000, cacheWrite: 0, totalCost: 3.094 },
			true,
		),
		"↑216k ↓12k R3.3M $3.094 (sub)",
	);
});

test("sumUsageFromEntries totals assistant, tool, and summary usage once", () => {
	const totals = sumUsageFromEntries([
		{ type: "message", message: { role: "user" } },
		{ type: "message", message: { role: "assistant", usage: { input: 100, output: 20, reasoning: 10, cacheRead: 30, cacheWrite: 40, cost: { total: 0.2 } } } },
		{ type: "message", message: { role: "toolResult", usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0.02 } } } },
		{ type: "compaction", usage: { input: 20, output: 3, cacheRead: 4, cacheWrite: 5, cost: { total: 0.03 } } },
		{ type: "branch_summary", usage: { input: 30, output: 4, cacheRead: 5, cacheWrite: 6, cost: { total: 0.04 } } },
	]);

	assert.deepEqual(totals, { input: 160, output: 29, cacheRead: 42, cacheWrite: 55, totalCost: 0.29 });
});

test("formatModelName includes provider when available", () => {
	assert.equal(formatModelName({ provider: "openai-codex", id: "gpt-5.5", reasoning: true }, "medium"), "openai-codex/gpt-5.5");
});

test("formatLocationLine separates cwd and branch without parentheses", () => {
	const home = process.env.HOME || process.env.USERPROFILE;
	assert.ok(home);
	assert.equal(
		formatLocationLine({ cwd: `${home}/dev/ladislas/mypac`, branch: "ladislas/feature/footer_token-budget-indicators" }),
		"~/dev/ladislas/mypac · ladislas/feature/footer_token-budget-indicators",
	);
});

test("formatSessionLine keeps short session id and simplified issue name", () => {
	assert.equal(formatSessionLine({ sessionId: "abc123456789", sessionName: "lwot - issue #265" }), "session abc12345 · lwot #265");
});

test("long location is truncated to keep session metadata on the first line", () => {
	const theme = { fg: (_color, text) => text };
	const home = process.env.HOME || process.env.USERPROFILE;
	assert.ok(home);

	const lines = renderFooterLines(
		{
			cwd: `${home}/dev/ladislas/mypac`,
			branch: "ladislas/bugfix/423-bootstrap_uv_ordering",
			sessionId: "01a05268abcdef",
			sessionName: "llat - issue #423",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
		},
		80,
		theme,
	);

	assert.equal(lines.length, 2);
	assert.equal(visibleWidth(lines[0]), 80);
	assert.match(lines[0], /01a05268 · llat #423$/);
	assert.match(lines[0], /\.\.\./);
	assert.doesNotMatch(lines[0], /bootstrap_uv_ordering/);
});

test("genuinely narrow footer keeps session metadata on its own line", () => {
	const theme = { fg: (_color, text) => text };
	const lines = renderFooterLines(
		{
			cwd: "/tmp/project",
			branch: "long-branch-name",
			sessionId: "01a05268abcdef",
			sessionName: "llat - issue #423",
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
		},
		27,
		theme,
	);

	assert.equal(lines.length, 3);
	assert.doesNotMatch(lines[0], /01a05268/);
	assert.equal(lines[1], "01a05268 · llat #423");
});

test("usage budget color gets more urgent as remaining budget falls", () => {
	assert.equal(getBudgetColor(100), "success");
	assert.equal(getBudgetColor(41), "success");
	assert.equal(getBudgetColor(40), "warning");
	assert.equal(getBudgetColor(20), "error");
});

test("context color warns before and turns red at the fixed 120k dumb zone", () => {
	assert.equal(getContextColor(71_999), "success");
	assert.equal(getContextColor(72_000), "warning");
	assert.equal(getContextColor(120_000), "error");
});

test("provider usage label puts provider before usage", () => {
	const theme = { fg: (_color, text) => text };
	const [line] = renderProviderUsageLines({ provider: "Codex", windows: [{ label: "5h", usedPercent: 25 }] }, 80, theme);

	assert.match(line, /^Codex usage\b/);
	assert.doesNotMatch(line, /^usage Codex\b/);
});

test("provider usage label uses current thinking level color", () => {
	const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
	const [line] = renderProviderUsageLines({ provider: "Codex", windows: [{ label: "5h", usedPercent: 25 }] }, 120, theme, "high");

	assert.match(line, /^<thinkingHigh>Codex<\/thinkingHigh><dim> usage<\/dim>/);
});

test("provider usage uses compact separators", () => {
	const theme = { fg: (_color, text) => text };
	const [line] = renderProviderUsageLines({ provider: "Codex", windows: [{ label: "5h", usedPercent: 25 }, { label: "7d", usedPercent: 5 }] }, 120, theme);

	assert.match(line, /Codex usage · 5h/);
	assert.doesNotMatch(line, /   ·   /);
});

test("written thinking level uses current thinking level color", () => {
	const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
	const lines = renderFooterLines(
		{
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
			model: { provider: "openai-codex", id: "gpt-5.5", reasoning: true },
			thinkingLevel: "high",
		},
		120,
		theme,
	);

	assert.match(lines.join("\n"), /<thinkingHigh>high<\/thinkingHigh>/);
	assert.doesNotMatch(lines.join("\n"), /<accent>high<\/accent>/);
});

test("maximum thinking level uses thinkingMax color", () => {
	const theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
	const lines = renderFooterLines(
		{
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
			model: { provider: "openai-codex", id: "gpt-5.5", reasoning: true },
			thinkingLevel: "max",
			providerUsage: { provider: "Codex", windows: [{ label: "5h", usedPercent: 25 }] },
		},
		120,
		theme,
	);

	assert.match(lines.join("\n"), /<thinkingMax>max<\/thinkingMax>/);
	assert.match(lines.join("\n"), /<thinkingMax>Codex<\/thinkingMax>/);
});

test("headroom indicator renders on provider usage line with savings", () => {
	const theme = { fg: (_color, text) => text };
	const lines = renderFooterLines(
		{
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
			model: { provider: "openai-codex", id: "gpt-5.5", reasoning: true },
			thinkingLevel: "medium",
			providerUsage: { provider: "Codex", windows: [{ label: "5h", usedPercent: 29, resetsIn: "21m" }] },
			headroomState: { status: "working", tokensSaved: 1234, compressionPercent: 17.6 },
		},
		140,
		theme,
	);

	const usageLine = lines.find((line) => line.includes("Codex usage"));
	assert.ok(usageLine);
	assert.match(usageLine, /^Codex usage · 5h/);
	assert.match(usageLine, /Headroom ✓ \(1\.2k\/18%\)$/);
	assert.ok(usageLine.includes("   Headroom"));
});

test("headroom indicator renders not-started state", () => {
	const theme = { fg: (_color, text) => text };
	const lines = renderFooterLines(
		{
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
			headroomState: { status: "not_started" },
		},
		80,
		theme,
	);

	assert.match(lines.join("\n"), /Headroom - \(0\/0%\)/);
});

test("right-only headroom line does not start with a separator when narrow", () => {
	const theme = { fg: (_color, text) => text };
	const lines = renderFooterLines(
		{
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 },
			usingSubscription: false,
			headroomState: { status: "not_started" },
		},
		12,
		theme,
	);

	assert.match(lines.at(-1), /^Headroom/);
	assert.doesNotMatch(lines.at(-1), /^ ·/);
});
