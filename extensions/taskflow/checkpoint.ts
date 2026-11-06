import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ForgeRepository, ForgeResult } from "../../lib/forge.ts";
import type { GitStatus, TaskIssue } from "./types.ts";

const START_MARKER = "<!-- pi-taskflow:start -->";
const END_MARKER = "<!-- pi-taskflow:end -->";

type ExecLike = Pick<ExtensionAPI, "exec">;

function projectUrl(repository: ForgeRepository): string {
	return `https://${repository.host}/${repository.project}`;
}

function safeError(operation: string, result: { code: number; stdout: string; stderr: string }): string {
	const output = [result.stderr, result.stdout]
		.join("\n")
		.split(/\r?\n/)
		.filter((line) => !/token|password|secret|authorization/i.test(line))
		.join("\n")
		.trim();
	return output ? `${operation}: ${output}` : `${operation} failed with exit code ${result.code}`;
}

export function buildCheckpointTemplate(git: GitStatus): string {
	return `<!-- pi-taskflow:checkpoint:v1 -->

## Checkpoint

### Completed
-

### Decisions
-

### Remaining
-

### Blockers
-

### Next action
-

### References
- Branch: ${git.branch ?? ""}
- Commit: ${git.commit ?? ""}
- Merge request:
`;
}

export function buildTaskflowDescription(description: string, noteUrl: string, savedAt: string): string {
	const block = `${START_MARKER}\n## Pi TaskFlow\n\n- Latest checkpoint: ${noteUrl}\n- Saved at: ${savedAt}\n${END_MARKER}`;
	const start = description.indexOf(START_MARKER);
	const end = description.indexOf(END_MARKER);
	if (start !== -1 && end >= start) {
		return `${description.slice(0, start)}${block}${description.slice(end + END_MARKER.length)}`;
	}
	return `${description.trimEnd()}${description.trim() ? "\n\n" : ""}${block}\n`;
}

function extractSection(markdown: string, heading: string): string {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((line) => line.trim().toLowerCase() === `### ${heading.toLowerCase()}`);
	if (start === -1) return "";
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index += 1) {
		if (/^#{1,3}\s+/.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines.slice(start + 1, end).join("\n").trim();
}

export function formatCheckpointStatus(description: string, checkpoint: string | null): string {
	const reserved = description.match(/<!-- pi-taskflow:start -->([\s\S]*?)<!-- pi-taskflow:end -->/)?.[1] ?? "";
	const pointer = reserved.match(/Latest checkpoint:\s*(\S+)/i)?.[1];
	const lines = pointer ? [`Checkpoint: ${pointer}`] : [];
	const nextAction = checkpoint ? extractSection(checkpoint, "Next action") : "";
	if (nextAction) lines.push(`Next action: ${nextAction.replace(/\s+/g, " ")}`);
	return lines.join("\n");
}

export function extractLatestCheckpointNoteId(description: string): number | null {
	const reserved = description.match(/<!-- pi-taskflow:start -->([\s\S]*?)<!-- pi-taskflow:end -->/)?.[1] ?? "";
	const match = reserved.match(/#note_(\d+)/);
	if (!match) return null;
	const id = Number(match[1]);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function fetchLatestCheckpoint(
	pi: ExecLike,
	repository: ForgeRepository,
	issue: TaskIssue,
): Promise<ForgeResult<string | null>> {
	const noteId = extractLatestCheckpointNoteId(issue.description);
	if (!noteId) return { ok: true, value: null };
	const endpoint = `projects/${encodeURIComponent(repository.project)}/issues/${issue.iid}/notes/${noteId}`;
	const result = await pi.exec("glab", ["api", "--hostname", repository.host, endpoint], { timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: safeError(`Could not read checkpoint note ${noteId}`, result) };
	try {
		const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
		if (typeof parsed.body !== "string") throw new Error("missing note body");
		return { ok: true, value: parsed.body };
	} catch (error) {
		return { ok: false, error: `Could not parse checkpoint note ${noteId}: ${error instanceof Error ? error.message : String(error)}` };
	}
}

export async function postCheckpoint(
	pi: ExecLike,
	repository: ForgeRepository,
	issue: TaskIssue,
	body: string,
): Promise<ForgeResult<{ noteId: number; noteUrl: string }>> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-taskflow-"));
	const input = path.join(directory, "note.json");
	try {
		await fs.writeFile(input, JSON.stringify({ body }), { mode: 0o600 });
		const endpoint = `projects/${encodeURIComponent(repository.project)}/issues/${issue.iid}/notes`;
		const result = await pi.exec("glab", ["api", "--hostname", repository.host, "--method", "POST", "--input", input, endpoint], { timeout: 30_000 });
		if (result.code !== 0) return { ok: false, error: safeError(`Could not save checkpoint for issue #${issue.iid}`, result) };
		const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
		if (typeof parsed.id !== "number") throw new Error("missing note id");
		return { ok: true, value: { noteId: parsed.id, noteUrl: `${issue.webUrl}#note_${parsed.id}` } };
	} catch (error) {
		return { ok: false, error: `Could not save checkpoint for issue #${issue.iid}: ${error instanceof Error ? error.message : String(error)}` };
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}

export async function updateTaskflowDescription(
	pi: ExecLike,
	repository: ForgeRepository,
	issue: TaskIssue,
	description: string,
): Promise<ForgeResult<true>> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-taskflow-"));
	const input = path.join(directory, "description.md");
	try {
		await fs.writeFile(input, description, { mode: 0o600 });
		const result = await pi.exec("glab", [
			"issue", "update", String(issue.iid), "--repo", projectUrl(repository), "--description-file", input,
		], { timeout: 30_000 });
		return result.code === 0
			? { ok: true, value: true }
			: { ok: false, error: safeError(`Could not update TaskFlow pointer for issue #${issue.iid}`, result) };
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
}
