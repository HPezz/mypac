import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	buildIssueBranch,
	findWorktreeByBranch,
	formatIssueWorktreeSummary,
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
			if (tokens[0] !== "issue") {
				ctx.ui.notify("Usage: /worktree issue <issue-number-or-url>", "info");
				return;
			}

			const target = parseIssueTarget(tokens.slice(1).join(" "));
			if (!target) {
				ctx.ui.notify("Usage: /worktree issue <issue-number-or-url>", "error");
				return;
			}

			const repoResult = target.kind === "url" ? { ok: true as const, value: `${target.owner}/${target.repo}` } : await inferRepo(pi);
			if (!repoResult.ok) {
				ctx.ui.notify(repoResult.error, "error");
				return;
			}

			const issueResult = await fetchIssue(pi, repoResult.value, target.number);
			if (!issueResult.ok) {
				ctx.ui.notify(issueResult.error, "error");
				return;
			}

			const issue = issueResult.value;
			const branch = buildIssueBranch(issue.number, issue.title);
			const worktreeResult = await ensureWorktree(pi, branch);
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
				}),
				"info",
			);
		},
	});
}

async function inferRepo(pi: ExtensionAPI): Promise<CommandResult<string>> {
	const result = await pi.exec("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
		timeout: 30_000,
	});
	if (result.code !== 0) return { ok: false, error: formatExecError("Could not infer GitHub repository", result) };

	const repo = result.stdout.trim();
	if (!/^[^/]+\/[^/]+$/.test(repo)) return { ok: false, error: "Could not infer GitHub repository." };
	return { ok: true, value: repo };
}

async function fetchIssue(pi: ExtensionAPI, repo: string, number: number): Promise<CommandResult<IssueMetadata>> {
	const result = await pi.exec(
		"gh",
		["issue", "view", String(number), "--repo", repo, "--json", "number,title,url"],
		{ timeout: 30_000 },
	);
	if (result.code !== 0) return { ok: false, error: formatExecError(`Could not read issue #${number}`, result) };

	try {
		const parsed = JSON.parse(result.stdout) as Partial<IssueMetadata>;
		if (typeof parsed.number !== "number" || typeof parsed.title !== "string" || typeof parsed.url !== "string") {
			return { ok: false, error: `Could not parse issue #${number} metadata from gh output.` };
		}
		return { ok: true, value: { number: parsed.number, title: parsed.title, url: parsed.url } };
	} catch (error) {
		return { ok: false, error: `Could not parse issue #${number} metadata: ${error instanceof Error ? error.message : String(error)}` };
	}
}

async function ensureWorktree(pi: ExtensionAPI, branch: string): Promise<CommandResult<{ created: boolean; path: string }>> {
	const before = await listWorktrees(pi);
	if (!before.ok) return before;

	const existing = findWorktreeByBranch(before.value, branch);
	if (existing?.path) return { ok: true, value: { created: false, path: existing.path } };

	const create = await pi.exec("wt", ["switch", "--create", "--no-cd", branch], { timeout: 120_000 });
	if (create.code !== 0) return { ok: false, error: formatExecError(`Could not create Worktrunk worktree for ${branch}`, create) };

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
