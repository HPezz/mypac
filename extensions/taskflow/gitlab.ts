import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ForgeRepository, ForgeResult } from "../../lib/forge.ts";
import type { TaskIssue } from "./types.ts";

const STATE_LABELS = {
	todo: "State::To Do",
	doing: "State::Doing",
	review: "State::Waiting for Review",
	done: "State::Done",
} as const;

export type TaskStateAlias = keyof typeof STATE_LABELS;

function repositoryGroup(repository: ForgeRepository): string | null {
	const parts = repository.project.split("/");
	return parts.length < 2 ? null : parts.slice(0, -1).join("/");
}

type ExecLike = Pick<ExtensionAPI, "exec">;

function projectUrl(repository: ForgeRepository): string {
	return `https://${repository.host}/${repository.project}`;
}

function sanitizeError(text: string): string {
	return text
		.split(/\r?\n/)
		.filter((line) => !/token|password|secret|authorization/i.test(line))
		.join("\n")
		.trim();
}

function executionError(operation: string, result: { code: number; stdout: string; stderr: string }): string {
	const detail = sanitizeError([result.stderr, result.stdout].filter(Boolean).join("\n"));
	return detail ? `${operation}: ${detail}` : `${operation} failed with exit code ${result.code}`;
}

export async function resolveCurrentGitLabRepository(
	pi: ExecLike,
	cwd: string,
): Promise<ForgeResult<ForgeRepository>> {
	const result = await pi.exec("glab", ["repo", "view", "--output", "json"], { cwd, timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: executionError("Could not resolve the current GitLab repository", result) };
	try {
		const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
		if (typeof parsed.path_with_namespace !== "string" || typeof parsed.web_url !== "string") {
			throw new Error("missing path_with_namespace or web_url");
		}
		const url = new URL(parsed.web_url);
		return {
			ok: true,
			value: { provider: "gitlab", host: url.host, project: parsed.path_with_namespace },
		};
	} catch (error) {
		return { ok: false, error: `Could not parse current GitLab repository: ${error instanceof Error ? error.message : String(error)}` };
	}
}

function parseIssue(value: unknown): TaskIssue {
	if (!value || typeof value !== "object") throw new Error("expected issue object");
	const issue = value as Record<string, unknown>;
	if (typeof issue.iid !== "number" || typeof issue.title !== "string") throw new Error("missing issue iid or title");
	const webUrl = issue.web_url ?? issue.webUrl;
	if (typeof webUrl !== "string") throw new Error("missing issue web URL");
	return {
		iid: issue.iid,
		title: issue.title,
		description: typeof issue.description === "string" ? issue.description : "",
		state: typeof issue.state === "string" ? issue.state : "unknown",
		labels: Array.isArray(issue.labels) ? issue.labels.filter((label): label is string => typeof label === "string") : [],
		assignees: Array.isArray(issue.assignees)
			? issue.assignees.flatMap((assignee) => assignee && typeof assignee === "object" && typeof (assignee as Record<string, unknown>).username === "string" ? [(assignee as Record<string, unknown>).username as string] : [])
			: [],
		webUrl,
		updatedAt: typeof issue.updated_at === "string" ? issue.updated_at : "",
	};
}

export async function fetchTaskIssue(
	pi: ExecLike,
	repository: ForgeRepository,
	iid: number,
): Promise<ForgeResult<TaskIssue>> {
	const result = await pi.exec("glab", [
		"issue", "view", String(iid), "--repo", projectUrl(repository), "--output", "json",
	], { timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: executionError(`Could not read issue #${iid}`, result) };
	try {
		return { ok: true, value: parseIssue(JSON.parse(result.stdout)) };
	} catch (error) {
		return { ok: false, error: `Could not parse issue #${iid}: ${error instanceof Error ? error.message : String(error)}` };
	}
}

export async function listReadyTasks(
	pi: ExecLike,
	repository: ForgeRepository,
): Promise<ForgeResult<TaskIssue[]>> {
	const group = repositoryGroup(repository);
	if (!group) return { ok: false, error: `Could not derive a GitLab group from ${repository.project}` };
	const endpoint = `groups/${encodeURIComponent(group)}/issues?state=opened&labels=pac%3Aready_for_agent&per_page=100`;
	const result = await pi.exec("glab", ["api", "--hostname", repository.host, endpoint], { timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: executionError("Could not list ready GitLab issues", result) };
	try {
		const parsed = JSON.parse(result.stdout) as unknown;
		if (!Array.isArray(parsed)) throw new Error("expected issue array");
		return { ok: true, value: parsed.map(parseIssue) };
	} catch (error) {
		return { ok: false, error: `Could not parse ready GitLab issues: ${error instanceof Error ? error.message : String(error)}` };
	}
}

async function fetchAvailableStateLabels(
	pi: ExecLike,
	repository: ForgeRepository,
): Promise<ForgeResult<Set<string>>> {
	const endpoint = `projects/${encodeURIComponent(repository.project)}/labels?include_ancestor_groups=true&per_page=100`;
	const result = await pi.exec("glab", ["api", "--hostname", repository.host, endpoint], { timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: executionError("Could not inspect GitLab labels", result) };
	try {
		const parsed = JSON.parse(result.stdout) as unknown;
		if (!Array.isArray(parsed)) throw new Error("expected label array");
		return {
			ok: true,
			value: new Set(parsed.flatMap((label) => label && typeof label === "object" && typeof (label as Record<string, unknown>).name === "string" ? [(label as Record<string, unknown>).name as string] : [])),
		};
	} catch (error) {
		return { ok: false, error: `Could not parse GitLab labels: ${error instanceof Error ? error.message : String(error)}` };
	}
}

export async function moveTaskState(
	pi: ExecLike,
	repository: ForgeRepository,
	issue: TaskIssue,
	alias: TaskStateAlias,
): Promise<ForgeResult<string>> {
	const target = STATE_LABELS[alias];
	const available = await fetchAvailableStateLabels(pi, repository);
	if (!available.ok) return available;
	if (!available.value.has(target)) {
		return { ok: false, error: `Expected workflow label is missing: ${target}` };
	}

	const current = issue.labels.filter((label) => label.startsWith("State::"));
	if (current.length === 1 && current[0] === target) return { ok: true, value: target };
	const args = ["issue", "update", String(issue.iid), "--repo", projectUrl(repository)];
	for (const label of current) args.push("--unlabel", label);
	args.push("--label", target);
	const result = await pi.exec("glab", args, { timeout: 30_000 });
	return result.code === 0
		? { ok: true, value: target }
		: { ok: false, error: executionError(`Could not move issue #${issue.iid} to ${target}`, result) };
}

export function taskStateLabel(alias: TaskStateAlias): string {
	return STATE_LABELS[alias];
}

export function isTaskStateAlias(value: string): value is TaskStateAlias {
	return Object.hasOwn(STATE_LABELS, value);
}
