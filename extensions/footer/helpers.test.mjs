import test from "node:test";
import assert from "node:assert/strict";
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

test("sumUsageFromEntries totals assistant usage", () => {
	const totals = sumUsageFromEntries([
		{ type: "message", message: { role: "user" } },
		{ type: "message", message: { role: "assistant", usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 40, cost: { total: 0.2 } } } },
		{ type: "message", message: { role: "assistant", usage: { input: 200, output: 30, cacheRead: 50, cacheWrite: 60, cost: { total: 0.3 } } } },
	]);

	assert.deepEqual(totals, { input: 300, output: 50, cacheRead: 80, cacheWrite: 100, totalCost: 0.5 });
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
