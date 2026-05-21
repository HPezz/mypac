import test from "node:test";
import assert from "node:assert/strict";
import {
	formatLocationLine,
	formatModelName,
	formatSessionLine,
	formatStatusSegment,
	getBudgetColor,
	getContextColor,
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
