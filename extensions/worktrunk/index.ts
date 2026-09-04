import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveForgeRepository, type ForgeRepository } from "../../lib/forge.ts";
import {
	buildIssueBranch,
	findWorktreeByBranch,
	formatBranchWorktreeSummary,
	formatCurrentWorktreeStatus,
	formatIssueWorktreeSummary,
	formatWorktreeList,
	parseIssueTarget,
	parseWorktrunkList,
} from "./helpers.ts";

type IssueMetadata = {
	number: number;
	title: string;
	url: string;
};

type CommandResult<T> = { ok: true; value: T } | { ok: false; error: string };

export default function worktrunkExtension(pi: ExtensionAPI): void {
	pi.registerCommand("worktree", {
		description: "Manage Worktrunk worktrees",
		handler: async (args, ctx) => {
			const tokens = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const command = tokens[0];

			if (command === "list" || command === "ls") {
				const result = await listWorktrees(pi);
				ctx.ui.notify(result.ok ? formatWorktreeList(result.value) : result.error, result.ok ? "info" : "error");
				return;
			}

			if (command === "status") {
				const result = await listWorktrees(pi);
				ctx.ui.notify(result.ok ? formatCurrentWorktreeStatus(result.value) : result.error, result.ok ? "info" : "error");
				return;
			}

			if (command === "branch") {
				const branch = tokens.slice(1).join(" ").trim();
				if (!branch) {
					ctx.ui.notify("Usage: /worktree branch <branch>", "error");
					return;
				}

				const result = await ensureWorktree(pi, branch);
				ctx.ui.notify(result.ok ? formatBranchWorktreeSummary({ ...result.value, branch }) : result.error, result.ok ? "info" : "error");
				return;
			}

			if (command !== "issue") {
				ctx.ui.notify("Usage: /worktree <issue|branch|list|ls|status> [...args]", "info");
				return;
			}

			const target = parseIssueTarget(tokens.slice(1).join(" "));
			if (!target) {
				ctx.ui.notify("Usage: /worktree issue <issue-number-or-url>", "error");
				return;
			}

			const reference = target.kind === "url" ? target.reference : undefined;
			const repoResult = reference
				? { ok: true as const, value: { provider: reference.provider, host: reference.host, project: reference.project } }
				: await resolveForgeRepository((command, commandArgs) => pi.exec(command, commandArgs, { timeout: 30_000 }));
			if (!repoResult.ok) {
				ctx.ui.notify(repoResult.error, "error");
				return;
			}

			const issueNumber = target.kind === "url" ? target.reference.number : target.number;
			ctx.ui.notify(`Reading issue #${issueNumber} from ${repoResult.value.host}/${repoResult.value.project}...`, "info");
			const issueResult = await fetchIssue(pi, repoResult.value, issueNumber, reference?.url);
			if (!issueResult.ok) {
				ctx.ui.notify(issueResult.error, "error");
				return;
			}

			const issue = issueResult.value;
			const branch = buildIssueBranch(issue.number, issue.title);
			ctx.ui.notify(`Preparing Worktrunk worktree for #${issue.number} on ${branch}...`, "info");
			const worktreeResult = await ensureWorktree(pi, branch, (message) => ctx.ui.notify(message, "info"));
			if (!worktreeResult.ok) {
				ctx.ui.notify(worktreeResult.error, "error");
				return;
			}

			ctx.ui.notify(
				formatIssueWorktreeSummary({
					created: worktreeResult.value.created,
					issueNumber: issue.number,
					issueTitle: issue.title,
					branch,
					path: worktreeResult.value.path,
					lwotTarget: target.kind === "url" ? issue.url : String(issue.number),
				}),
				"info",
			);
		},
	});
}

export async function fetchIssue(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	number: number,
	explicitUrl?: string,
): Promise<CommandResult<IssueMetadata>> {
	const isGitHub = repository.provider === "github";
	const command = isGitHub ? "gh" : "glab";
	const repo = isGitHub
		? repository.host === "github.com" ? repository.project : `${repository.host}/${repository.project}`
		: `https://${repository.host}/${repository.project}`;
	const args = isGitHub
		? ["issue", "view", String(number), "--repo", repo, "--json", "number,title,url"]
		: ["issue", "view", explicitUrl ?? String(number), "--repo", repo, "--output", "json"];
	const result = await pi.exec(command, args, { timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: formatExecError(`Could not read issue #${number}`, result) };

	try {
		const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
		const parsedNumber = parsed.number ?? parsed.iid;
		const parsedUrl = parsed.url ?? parsed.web_url ?? parsed.webUrl;
		if (typeof parsedNumber !== "number" || typeof parsed.title !== "string" || typeof parsedUrl !== "string") {
			return { ok: false, error: `Could not parse issue #${number} metadata from ${command} output.` };
		}
		return { ok: true, value: { number: parsedNumber, title: parsed.title, url: parsedUrl } };
	} catch (error) {
		return { ok: false, error: `Could not parse issue #${number} metadata: ${error instanceof Error ? error.message : String(error)}` };
	}
}

export async function ensureWorktree(
	pi: ExtensionAPI,
	branch: string,
	onProgress?: (message: string) => void,
): Promise<CommandResult<{ created: boolean; path: string }>> {
	onProgress?.("Checking Worktrunk worktrees...");
	const before = await listWorktrees(pi);
	if (!before.ok) return before;

	const existing = findWorktreeByBranch(before.value, branch);
	if (existing && !existing.path) {
		return { ok: false, error: `Worktree for ${branch} exists but has no path in wt list output.` };
	}
	if (existing?.path) return { ok: true, value: { created: false, path: existing.path } };

	onProgress?.(`Creating Worktrunk worktree for ${branch}. This may run setup hooks...`);
	const createArgs = ["switch", "--create", "--no-cd", "--yes", branch];
	const create = await pi.exec("wt", createArgs, { timeout: 120_000 });
	if (create.code !== 0) return { ok: false, error: formatExecError(`Could not create Worktrunk worktree for ${branch}`, create) };

	onProgress?.("Verifying Worktrunk worktree...");
	const after = await listWorktrees(pi);
	if (!after.ok) return after;

	const created = findWorktreeByBranch(after.value, branch);
	if (!created?.path) {
		return { ok: false, error: `Worktrunk completed, but ${branch} was not found in wt list output.` };
	}

	return { ok: true, value: { created: true, path: created.path } };
}

async function listWorktrees(pi: ExtensionAPI): Promise<CommandResult<ReturnType<typeof parseWorktrunkList>>> {
	const result = await pi.exec("wt", ["list", "--format=json"], { timeout: 30_000 });
	if (result.code !== 0) return { ok: false, error: formatExecError("Could not list Worktrunk worktrees", result) };

	try {
		return { ok: true, value: parseWorktrunkList(result.stdout) };
	} catch (error) {
		return { ok: false, error: `Could not parse wt list output: ${error instanceof Error ? error.message : String(error)}` };
	}
}

function formatExecError(prefix: string, result: { code: number; stdout: string; stderr: string }): string {
	const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
	return details ? `${prefix}: ${details}` : `${prefix}. Exit code: ${result.code}`;
}
