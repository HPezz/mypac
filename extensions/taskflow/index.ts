import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ForgeRepository } from "../../lib/forge.ts";
import {
	buildCheckpointTemplate,
	buildTaskflowDescription,
	fetchLatestCheckpoint,
	formatCheckpointStatus,
	postCheckpoint,
	updateTaskflowDescription,
} from "./checkpoint.ts";
import {
	fetchTaskIssue,
	isTaskStateAlias,
	listReadyTasks,
	moveTaskState,
	resolveCurrentGitLabRepository,
	taskStateLabel,
} from "./gitlab.ts";
import { buildTaskContextPreview, formatTaskStatus, parseTaskTarget } from "./issue-format.ts";
import { readTaskPointer, writeTaskPointer } from "./state.ts";
import type { GitStatus, TaskIssue, TaskPointer } from "./types.ts";

const WIDGET_KEY = "taskflow";

async function resolveRepository(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	explicit?: ForgeRepository,
): Promise<{ ok: true; value: ForgeRepository } | { ok: false; error: string }> {
	if (explicit) return { ok: true, value: explicit };
	const current = await resolveCurrentGitLabRepository(pi, ctx.cwd);
	if (current.ok) return current;
	const pointer = await readTaskPointer(ctx.cwd);
	return pointer
		? { ok: true, value: pointer.repository }
		: { ok: false, error: `${current.error}\nUse a full GitLab issue URL when Pi is running from a multi-repository workspace.` };
}

async function readGitStatus(pi: ExtensionAPI, cwd: string): Promise<GitStatus> {
	const [branch, commit] = await Promise.all([
		pi.exec("git", ["branch", "--show-current"], { cwd, timeout: 5_000 }),
		pi.exec("git", ["rev-parse", "--short", "HEAD"], { cwd, timeout: 5_000 }),
	]);
	return {
		branch: branch.code === 0 ? branch.stdout.trim() || undefined : undefined,
		commit: commit.code === 0 ? commit.stdout.trim() || undefined : undefined,
	};
}

function setTaskWidget(ctx: ExtensionContext, issue: TaskIssue): void {
	const state = issue.labels.find((label) => label.startsWith("State::")) ?? issue.state;
	ctx.ui.setWidget(WIDGET_KEY, [
		ctx.ui.theme.fg("accent", `Task #${issue.iid}`) + ctx.ui.theme.fg("muted", ` · ${issue.title}`),
		ctx.ui.theme.fg("dim", state),
	]);
}

function setPointerWidget(ctx: ExtensionContext, pointer: TaskPointer): void {
	ctx.ui.setWidget(WIDGET_KEY, [
		ctx.ui.theme.fg("accent", `Task #${pointer.iid}`) + ctx.ui.theme.fg("dim", ` · ${pointer.repository.project}`),
	]);
}

async function selectTask(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	repository: ForgeRepository,
	iid: number,
	prepareEditor: boolean,
): Promise<void> {
	const result = await fetchTaskIssue(pi, repository, iid);
	if (!result.ok) {
		ctx.ui.notify(result.error, "error");
		return;
	}
	const issue = result.value;
	await writeTaskPointer(ctx.cwd, {
		repository,
		iid: issue.iid,
		webUrl: issue.webUrl,
		selectedAt: new Date().toISOString(),
	});
	setTaskWidget(ctx, issue);
	const checkpoint = await fetchLatestCheckpoint(pi, repository, issue);
	if (!checkpoint.ok) ctx.ui.notify(checkpoint.error, "warning");
	const checkpointBody = checkpoint.ok ? checkpoint.value : null;
	const checkpointStatus = formatCheckpointStatus(issue.description, checkpointBody);
	ctx.ui.notify([formatTaskStatus(issue, await readGitStatus(pi, ctx.cwd)), checkpointStatus].filter(Boolean).join("\n"), "info");
	if (prepareEditor && ctx.hasUI) ctx.ui.setEditorText(buildTaskContextPreview(issue, checkpointBody));
}

async function getActiveTask(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<{ pointer: TaskPointer; issue: TaskIssue } | null> {
	const pointer = await readTaskPointer(ctx.cwd);
	if (!pointer) {
		ctx.ui.notify("No active TaskFlow issue. Use /task <iid|GitLab URL> or /task-next.", "warning");
		return null;
	}
	const result = await fetchTaskIssue(pi, pointer.repository, pointer.iid);
	if (!result.ok) {
		ctx.ui.notify(result.error, "error");
		return null;
	}
	return { pointer, issue: result.value };
}

function taskChoice(issue: TaskIssue): string {
	const project = issue.webUrl.match(/^https?:\/\/[^/]+\/(.+?)\/-\/(?:issues|work_items)\//)?.[1] ?? "unknown";
	const state = issue.labels.find((label) => label.startsWith("State::")) ?? issue.state;
	const execution = issue.labels.includes("pac:afk") ? "AFK" : issue.labels.includes("pac:hitl") ? "HITL" : "unspecified";
	return `${project}#${issue.iid} · ${state} · ${execution} · ${issue.title}`;
}

export default function taskflowExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		const pointer = await readTaskPointer(ctx.cwd);
		if (pointer) setPointerWidget(ctx, pointer);
	});

	pi.registerCommand("task", {
		description: "Select a GitLab issue and prepare concise context without calling the model",
		handler: async (args, ctx) => {
			const target = parseTaskTarget(args ?? "");
			if (!target) {
				ctx.ui.notify("Usage: /task <issue-iid|full-GitLab-issue-URL>", "error");
				return;
			}
			const explicit = target.kind === "url"
				? { provider: "gitlab" as const, host: target.reference.host, project: target.reference.project }
				: undefined;
			const repository = await resolveRepository(pi, ctx, explicit);
			if (!repository.ok) {
				ctx.ui.notify(repository.error, "error");
				return;
			}
			await selectTask(pi, ctx, repository.value, target.kind === "url" ? target.reference.number : target.iid, true);
		},
	});

	pi.registerCommand("task-next", {
		description: "Select a ready issue across the current GitLab group",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/task-next requires interactive or RPC UI mode.", "error");
				return;
			}
			const repository = await resolveRepository(pi, ctx);
			if (!repository.ok) {
				ctx.ui.notify(repository.error, "error");
				return;
			}
			const ready = await listReadyTasks(pi, repository.value);
			if (!ready.ok) {
				ctx.ui.notify(ready.error, "error");
				return;
			}
			if (ready.value.length === 0) {
				ctx.ui.notify("No open issues have pac:ready_for_agent in this GitLab group.", "info");
				return;
			}
			const choices = ready.value.map(taskChoice);
			const choice = await ctx.ui.select("Ready GitLab tasks", choices);
			if (!choice) return;
			const issue = ready.value[choices.indexOf(choice)];
			if (!issue) return;
			const target = parseTaskTarget(issue.webUrl);
			if (!target || target.kind !== "url") {
				ctx.ui.notify(`Could not resolve selected issue URL: ${issue.webUrl}`, "error");
				return;
			}
			await selectTask(pi, ctx, {
				provider: "gitlab",
				host: target.reference.host,
				project: target.reference.project,
			}, target.reference.number, true);
		},
	});

	pi.registerCommand("task-status", {
		description: "Show the active GitLab task without calling the model",
		handler: async (_args, ctx) => {
			const active = await getActiveTask(pi, ctx);
			if (!active) return;
			setTaskWidget(ctx, active.issue);
			const checkpoint = await fetchLatestCheckpoint(pi, active.pointer.repository, active.issue);
			if (!checkpoint.ok) ctx.ui.notify(checkpoint.error, "warning");
			const checkpointStatus = formatCheckpointStatus(active.issue.description, checkpoint.ok ? checkpoint.value : null);
			ctx.ui.notify([formatTaskStatus(active.issue, await readGitStatus(pi, ctx.cwd)), checkpointStatus].filter(Boolean).join("\n"), "info");
		},
	});

	pi.registerCommand("task-save", {
		description: "Save a structured GitLab checkpoint after preview and confirmation",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/task-save requires interactive or RPC UI mode.", "error");
				return;
			}
			const active = await getActiveTask(pi, ctx);
			if (!active) return;
			const edited = await ctx.ui.editor("TaskFlow checkpoint", buildCheckpointTemplate(await readGitStatus(pi, ctx.cwd)));
			if (!edited?.trim()) {
				ctx.ui.notify("Checkpoint cancelled.", "info");
				return;
			}
			const body = edited.includes("<!-- pi-taskflow:checkpoint:v1 -->")
				? edited.trim()
				: `<!-- pi-taskflow:checkpoint:v1 -->\n\n${edited.trim()}`;
			const confirmed = await ctx.ui.confirm("Publish TaskFlow checkpoint?", `${active.issue.webUrl}\n\n${body}`);
			if (!confirmed) {
				ctx.ui.notify("Checkpoint publication cancelled.", "info");
				return;
			}

			const latestBeforeWrite = await fetchTaskIssue(pi, active.pointer.repository, active.issue.iid);
			if (!latestBeforeWrite.ok) {
				ctx.ui.notify(latestBeforeWrite.error, "error");
				return;
			}
			if (latestBeforeWrite.value.updatedAt && active.issue.updatedAt && latestBeforeWrite.value.updatedAt !== active.issue.updatedAt) {
				const continueAfterChange = await ctx.ui.confirm(
					"Issue changed remotely",
					"The GitLab issue changed while the checkpoint editor was open. Publish the checkpoint against the latest issue state?",
				);
				if (!continueAfterChange) {
					ctx.ui.notify("Checkpoint publication cancelled after remote change.", "warning");
					return;
				}
			}

			const posted = await postCheckpoint(pi, active.pointer.repository, latestBeforeWrite.value, body);
			if (!posted.ok) {
				ctx.ui.notify(posted.error, "error");
				return;
			}
			const latestAfterNote = await fetchTaskIssue(pi, active.pointer.repository, active.issue.iid);
			if (!latestAfterNote.ok) {
				ctx.ui.notify(`Checkpoint saved at ${posted.value.noteUrl}, but the issue pointer could not be updated: ${latestAfterNote.error}`, "warning");
				return;
			}
			const savedAt = new Date().toISOString();
			const description = buildTaskflowDescription(latestAfterNote.value.description, posted.value.noteUrl, savedAt);
			const updated = await updateTaskflowDescription(pi, active.pointer.repository, latestAfterNote.value, description);
			if (!updated.ok) {
				ctx.ui.notify(`Checkpoint saved at ${posted.value.noteUrl}. ${updated.error}`, "warning");
				return;
			}
			const verified = await fetchTaskIssue(pi, active.pointer.repository, active.issue.iid);
			if (!verified.ok || !verified.value.description.includes(posted.value.noteUrl)) {
				ctx.ui.notify(`Checkpoint saved at ${posted.value.noteUrl}, but pointer verification failed.`, "warning");
				return;
			}
			setTaskWidget(ctx, verified.value);
			ctx.ui.notify(`Checkpoint saved: ${posted.value.noteUrl}`, "info");
		},
	});

	pi.registerCommand("task-move", {
		description: "Move the active task between existing State labels after confirmation",
		getArgumentCompletions: (prefix) => ["todo", "doing", "review", "done"]
			.filter((value) => value.startsWith(prefix))
			.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const alias = (args ?? "").trim();
			if (!isTaskStateAlias(alias)) {
				ctx.ui.notify("Usage: /task-move <todo|doing|review|done>", "error");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify("/task-move requires explicit confirmation in interactive or RPC UI mode.", "error");
				return;
			}
			const active = await getActiveTask(pi, ctx);
			if (!active) return;
			const current = active.issue.labels.filter((label) => label.startsWith("State::"));
			const target = taskStateLabel(alias);
			const confirmed = await ctx.ui.confirm(
				"Move GitLab task?",
				[`Issue: ${active.issue.webUrl}`, `Remove: ${current.join(", ") || "(none)"}`, `Add: ${target}`].join("\n"),
			);
			if (!confirmed) {
				ctx.ui.notify("Task move cancelled.", "info");
				return;
			}
			const moved = await moveTaskState(pi, active.pointer.repository, active.issue, alias);
			if (!moved.ok) {
				ctx.ui.notify(moved.error, "error");
				return;
			}
			const refreshed = await fetchTaskIssue(pi, active.pointer.repository, active.issue.iid);
			if (refreshed.ok) setTaskWidget(ctx, refreshed.value);
			ctx.ui.notify(`Task moved to ${moved.value}.`, "info");
		},
	});
}
