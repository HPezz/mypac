import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePiSessionLines } from "./pi-session-telemetry.ts";

const jsonl = (records) => records.map((record) => typeof record === "string" ? record : JSON.stringify(record)).join("\n") + "\n";

test("parses trustworthy usage and configuration telemetry from a Pi session", () => {
	const parsed = parsePiSessionLines(jsonl([
		{ type: "session", id: "session-1", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/tmp/repo" },
		{ type: "model_change", provider: "openai-codex", modelId: "requested-model" },
		{ type: "thinking_level_change", thinkingLevel: "high" },
		{ type: "message", message: { role: "user", content: "do work" } },
		{ type: "message", message: { role: "assistant", provider: "openai-codex", model: "actual-model", usage: {
			input: 10, output: 5, cacheRead: 3, cacheWrite: 2, totalTokens: 20,
			contextTokens: 15, maxContextTokens: 100, cost: { total: 0.2 },
		} } },
	]), "session.jsonl");

	assert.equal(parsed.sessionId, "session-1");
	assert.equal(parsed.messages, 2);
	assert.equal(parsed.assistantTurns, 1);
	assert.deepEqual(parsed.modelsUsed, new Set(["openai-codex/requested-model", "openai-codex/actual-model"]));
	assert.deepEqual(parsed.actualConfiguration, { provider: "openai-codex", model: "actual-model", thinking: "high" });
	assert.deepEqual(parsed.contextTokenSamples, [15]);
	assert.equal(parsed.maxContextTokens, 100);
	assert.equal(parsed.tokens, 20);
	assert.equal(parsed.totalCost, 0.2);
	assert.equal(parsed.availability.totalTokens, true);
	assert.equal(parsed.availability.reportedCost, true);
});

test("session-breakdown and pac-eval share one parsing implementation", async () => {
	const [breakdown, evaluation] = await Promise.all([
		readFile(new URL("../extensions/session-breakdown/helpers.ts", import.meta.url), "utf8"),
		readFile(new URL("../scripts/pac-eval.ts", import.meta.url), "utf8"),
	]);
	assert.match(breakdown, /from "\.\.\/\.\.\/lib\/pi-session-telemetry\.ts"/);
	assert.match(evaluation, /from "\.\.\/lib\/pi-session-telemetry\.ts"/);
	assert.doesNotMatch(breakdown, /function extractTokens\s*\(/);
	assert.doesNotMatch(evaluation, /function extractTokens\s*\(/);
});

test("partial malformed sessions retain exposed facts and mark unavailable usage", () => {
	const parsed = parsePiSessionLines(jsonl([
		{ type: "session", id: "partial", timestamp: "2026-01-01T00:00:00.000Z" },
		{ type: "model_change", provider: "anthropic", modelId: "claude" },
		"{broken",
	]), "session.jsonl");

	assert.equal(parsed.sessionId, "partial");
	assert.equal(parsed.skippedLines, 1);
	assert.equal(parsed.tokens, 0);
	assert.equal(parsed.availability.totalTokens, false);
	assert.equal(parsed.availability.reportedCost, false);
	assert.deepEqual(parsed.actualConfiguration, { provider: "anthropic", model: "claude", thinking: null });
});
