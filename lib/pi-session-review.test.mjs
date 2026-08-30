import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverPiSessions } from "./pi-session-discovery.ts";
import { parseCompactPiSessionEvents } from "./pi-session-telemetry.ts";
import { analyzeSessionDirectory, formatBreakdownReport, formatCompactBreakdownReport } from "../extensions/session-breakdown/helpers.ts";

const jsonl = (records) => records.map((record) => typeof record === "string" ? record : JSON.stringify(record)).join("\n") + "\n";

test("discovers metadata only from a configured root and groups worktrees", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "pi-session-review-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const mainRepo = join(root, "dev/ladislas/mypac");
	const worktree = join(root, "dev/worktrees/ladislas/mypac/feature-review");
	const gitDir = join(mainRepo, ".git/worktrees/feature-review");
	await mkdir(gitDir, { recursive: true });
	await mkdir(worktree, { recursive: true });
	await writeFile(join(worktree, ".git"), `gitdir: ${gitDir}\n`);
	await writeFile(join(gitDir, "commondir"), "../..\n");
	await writeFile(join(root, "2026-05-20T10-00-00-000Z_session-v3.jsonl"), jsonl([
		{ type: "session", id: "session-v3", timestamp: "2026-05-20T10:00:00.000Z", cwd: worktree },
		{ type: "message", message: { role: "user", content: "PRIVATE USER CONTENT" } },
		"{malformed",
	]));

	const sessions = await discoverPiSessions({ root, repository: mainRepo, limit: 5 });
	assert.equal(sessions.length, 1);
	assert.deepEqual(sessions[0], {
		filePath: join(root, "2026-05-20T10-00-00-000Z_session-v3.jsonl"),
		sessionId: "session-v3",
		startedAt: new Date("2026-05-20T10:00:00.000Z"),
		cwd: worktree,
		repository: mainRepo,
		messages: 1,
		skippedLines: 1,
	});
	assert.doesNotMatch(JSON.stringify(sessions), /PRIVATE USER CONTENT/);
});

test("session-breakdown remains aggregate-only after shared discovery extraction", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "pi-session-privacy-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, "2026-05-20T10-00-00-000Z_private.jsonl"), jsonl([
		{ type: "session", timestamp: "2026-05-20T10:00:00.000Z", cwd: "/Users/alice/dev/project" },
		{ type: "message", message: { role: "user", content: "PRIVATE REVIEW SECRET" } },
		{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "private-call", name: "bash", arguments: { command: "PRIVATE TOOL SECRET" } }] } },
	]));
	const report = await analyzeSessionDirectory({ root, now: new Date("2026-05-22T12:00:00.000Z") });
	for (const output of [formatBreakdownReport(report), formatCompactBreakdownReport(report, { color: false })]) {
		assert.doesNotMatch(output, /PRIVATE REVIEW SECRET|PRIVATE TOOL SECRET|private-call/);
	}
});

test("extracts bounded ordered v3 events with linkage, failure state, and truncation", () => {
	const parsed = parseCompactPiSessionEvents(jsonl([
		{ type: "session", id: "v3" },
		{ type: "message", message: { role: "user", content: "Please inspect the broken build" } },
		{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "npm test -- --very-long-option" } }] } },
		{ type: "message", message: { role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "failed loudly" }], isError: true } },
		"{bad-json",
	]), { maxEvents: 3, maxTextLength: 12 });

	assert.deepEqual(parsed.events, [
		{ sequence: 1, kind: "user", text: "Please insp…", truncated: true },
		{ sequence: 2, kind: "tool-call", toolCallId: "call-1", toolName: "bash", text: "{\"command\":…", linked: true, truncated: true },
		{ sequence: 3, kind: "tool-result", toolCallId: "call-1", toolName: "bash", text: "failed loud…", isError: true, linked: true, truncated: true },
	]);
	assert.equal(parsed.totalEvents, 3);
	assert.equal(parsed.truncated, false);
	assert.equal(parsed.skippedLines, 1);
});

test("extracts v4 events, marks unlinked aborted calls, and caps the event list", () => {
	const parsed = parseCompactPiSessionEvents(jsonl([
		{ kind: "header", version: 4, id: "v4", createdAt: 1, cwd: "/tmp/repo" },
		{ kind: "entry", type: "message", id: "user-1", message: { role: "user", content: [{ type: "text", text: "run checks" }] } },
		{ kind: "entry", type: "message", id: "assistant-1", message: { role: "assistant", stopReason: "aborted", content: [{ type: "toolCall", id: "call-2", name: "bash", arguments: { command: "npm test" } }] } },
		{ kind: "entry", type: "message", id: "result-1", message: { role: "toolResult", toolCallId: "missing-call", toolName: "read", content: "not found", isError: false } },
	]), { maxEvents: 2 });

	assert.equal(parsed.totalEvents, 3);
	assert.equal(parsed.truncated, true);
	assert.deepEqual(parsed.events.map(({ kind, toolCallId, aborted, linked }) => ({ kind, toolCallId, aborted, linked })), [
		{ kind: "user", toolCallId: undefined, aborted: undefined, linked: undefined },
		{ kind: "tool-call", toolCallId: "call-2", aborted: true, linked: false },
	]);
});
