import { parseForgeReference } from "../../lib/forge.ts";
import type { GitStatus, TaskIssue, TaskTarget } from "./types.ts";

const STATE_PREFIX = "State::";
const PAC_PREFIX = "pac:";

export function parseTaskTarget(input: string): TaskTarget | null {
	const value = input.trim();
	if (/^[1-9]\d*$/.test(value)) {
		const iid = Number(value);
		return Number.isSafeInteger(iid) ? { kind: "iid", iid } : null;
	}

	const reference = parseForgeReference(value);
	if (!reference || reference.provider !== "gitlab" || reference.kind !== "issue") return null;
	return { kind: "url", reference };
}

function extractSection(description: string, names: string[]): string {
	const wanted = new Set(names.map((name) => name.toLowerCase()));
	const lines = description.replace(/\r\n/g, "\n").split("\n");
	let start = -1;
	let level = 0;

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index]?.match(/^(#{1,6})\s+(.+?)\s*$/);
		if (!match || !wanted.has(match[2].toLowerCase())) continue;
		start = index + 1;
		level = match[1].length;
		break;
	}
	if (start === -1) return "";

	let end = lines.length;
	for (let index = start; index < lines.length; index += 1) {
		const match = lines[index]?.match(/^(#{1,6})\s+/);
		if (match && match[1].length <= level) {
			end = index;
			break;
		}
	}
	return lines.slice(start, end).join("\n").trim();
}

export function extractTaskContext(description: string): {
	summary: string;
	acceptanceCriteria: string;
	decisions: string;
	checkpoint: string;
} {
	return {
		summary: extractSection(description, ["Summary", "Objective", "Goal", "Résumé", "Objectif"]),
		acceptanceCriteria: extractSection(description, ["Acceptance Criteria", "Critères d’acceptation", "Critères d'acceptation"]),
		decisions: extractSection(description, ["Decisions", "Décisions"]),
		checkpoint: extractSection(description, ["Pi TaskFlow"]),
	};
}

export function formatTaskStatus(issue: TaskIssue, git: GitStatus = {}): string {
	const workflowState = issue.labels.find((label) => label.startsWith(STATE_PREFIX)) ?? "(none)";
	const readiness = issue.labels.filter((label) => label.startsWith(PAC_PREFIX));
	const lines = [
		`#${issue.iid} ${issue.title}`,
		`State: ${workflowState} · ${issue.state}`,
		`Readiness: ${readiness.length ? readiness.join(" · ") : "(none)"}`,
		`Assignees: ${issue.assignees.length ? issue.assignees.join(", ") : "(none)"}`,
	];
	if (git.branch || git.commit) {
		lines.push(`Branch: ${git.branch ?? "(detached)"}${git.commit ? ` @ ${git.commit}` : ""}`);
	}
	lines.push(`URL: ${issue.webUrl}`);
	return lines.join("\n");
}

export function buildTaskContextPreview(issue: TaskIssue, latestCheckpoint?: string | null): string {
	const context = extractTaskContext(issue.description);
	const sections = [
		`Task: ${issue.webUrl}`,
		`Title: ${issue.title}`,
		`State: ${issue.labels.find((label) => label.startsWith(STATE_PREFIX)) ?? issue.state}`,
	];
	if (context.summary) sections.push(`\nObjective:\n${context.summary}`);
	if (context.acceptanceCriteria) sections.push(`\nAcceptance criteria:\n${context.acceptanceCriteria}`);
	if (context.decisions) sections.push(`\nApplicable decisions:\n${context.decisions}`);
	if (latestCheckpoint) sections.push(`\nLatest checkpoint:\n${latestCheckpoint}`);
	else if (context.checkpoint) sections.push(`\nLatest checkpoint pointer:\n${context.checkpoint}`);
	sections.push("\nContinue from this GitLab task using only the repository context needed for the next action.");
	return sections.join("\n");
}
