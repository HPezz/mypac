import { fileURLToPath } from "node:url";

import { LEGACY_LABEL_MAPPINGS, REQUIRED_PAC_LABELS } from "../extensions/pac-setup-workflows/config.ts";
import type { GitHubLabel, LabelSpec } from "../extensions/pac-setup-workflows/types.ts";

export const MANAGED_COMMENT_MARKER = "<!-- pac:label-health -->";

const PAC_STATE_LABELS = new Set([
	"pac:needs_triage",
	"pac:needs_info",
	"pac:ready_for_agent",
	"pac:ready_for_human",
	"pac:out_of_scope",
	"pac:wontfix",
]);

const EXECUTION_LABELS = new Set(["pac:hitl", "pac:afk"]);

type IssueComment = {
	id: number;
	body?: string;
};

export type LabelHealthProblem = {
	kind: "conflicting-state" | "conflicting-execution" | "legacy-label" | "missing-required-label" | "drifted-required-label";
	message: string;
};

export type LabelHealthInput = {
	issueLabels: string[];
	repositoryLabels: GitHubLabel[];
};

export type LabelHealthResult = {
	problems: LabelHealthProblem[];
};

export function normalizeColor(color: string): string {
	return color.replace(/^#/, "").toUpperCase();
}

function labelKey(name: string): string {
	return name.toLowerCase();
}

function formatLabelList(labels: string[]): string {
	return labels.map((label) => `\`${label}\``).join(", ");
}

export function analyzeIssueLabelHealth(input: LabelHealthInput): LabelHealthResult {
	const issueLabelNames = new Set(input.issueLabels.map(labelKey));
	const repositoryLabels = new Map(input.repositoryLabels.map((label) => [labelKey(label.name), label]));
	const problems: LabelHealthProblem[] = [];

	const presentStateLabels = [...PAC_STATE_LABELS].filter((label) => issueLabelNames.has(labelKey(label)));
	if (presentStateLabels.length > 1) {
		problems.push({
			kind: "conflicting-state",
			message: `Conflicting pac state/terminal labels are present: ${formatLabelList(presentStateLabels)}. Keep exactly one workflow state or terminal outcome label.`,
		});
	}

	const presentExecutionLabels = [...EXECUTION_LABELS].filter((label) => issueLabelNames.has(labelKey(label)));
	if (presentExecutionLabels.length > 1) {
		problems.push({
			kind: "conflicting-execution",
			message: `Conflicting pac execution labels are present: ${formatLabelList(presentExecutionLabels)}. Choose either \`pac:hitl\` or \`pac:afk\`, not both.`,
		});
	}

	for (const mapping of LEGACY_LABEL_MAPPINGS) {
		if (issueLabelNames.has(labelKey(mapping.legacy))) {
			problems.push({
				kind: "legacy-label",
				message: `Legacy label \`${mapping.legacy}\` is present. Replace it with \`${mapping.target}\`.`,
			});
		}
	}

	for (const expected of REQUIRED_PAC_LABELS) {
		const actual = repositoryLabels.get(labelKey(expected.name));
		if (!actual) {
			problems.push({
				kind: "missing-required-label",
				message: `Required pac workflow label \`${expected.name}\` is missing from the repository. Run \`/pac-setup-workflows\`.`,
			});
			continue;
		}

		const drift: string[] = [];
		if (normalizeColor(actual.color) !== normalizeColor(expected.color)) {
			drift.push(`color #${normalizeColor(actual.color)} should be #${normalizeColor(expected.color)}`);
		}
		if ((actual.description ?? "") !== expected.description) {
			drift.push(`description should be "${expected.description}"`);
		}
		if (drift.length > 0) {
			problems.push({
				kind: "drifted-required-label",
				message: `Required pac workflow label \`${expected.name}\` has setup drift: ${drift.join("; ")}. Run \`/pac-setup-workflows\`.`,
			});
		}
	}

	return { problems };
}

export function renderWarningComment(result: LabelHealthResult): string {
	const lines = [
		MANAGED_COMMENT_MARKER,
		"## Pac label-health warning",
		"",
		"This issue currently has pac workflow label problems:",
		"",
		...result.problems.map((problem) => `- ${problem.message}`),
		"",
		"Fix the labels, then the managed warning will be removed automatically on the next label-health run.",
	];

	return lines.join("\n");
}

class GitHubClient {
	private readonly repository: string;
	private readonly token: string;
	private readonly apiUrl: string;

	constructor(repository: string, token: string, apiUrl = "https://api.github.com") {
		this.repository = repository;
		this.token = token;
		this.apiUrl = apiUrl;
	}

	private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await fetch(`${this.apiUrl}${path}`, {
			...init,
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${this.token}`,
				"x-github-api-version": "2022-11-28",
				...init.headers,
			},
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return (await response.json()) as T;
	}

	async fetchIssueLabels(issueNumber: number): Promise<string[]> {
		const issue = await this.request<{ labels: Array<string | { name: string }> }>(`/repos/${this.repository}/issues/${issueNumber}`);
		return issue.labels.map((label) => (typeof label === "string" ? label : label.name));
	}

	async fetchRepositoryLabels(): Promise<GitHubLabel[]> {
		const labels: GitHubLabel[] = [];
		let page = 1;

		while (true) {
			const pageLabels = await this.request<GitHubLabel[]>(`/repos/${this.repository}/labels?per_page=100&page=${page}`);
			labels.push(...pageLabels);
			if (pageLabels.length < 100) break;
			page += 1;
		}

		return labels;
	}

	async fetchComments(issueNumber: number): Promise<IssueComment[]> {
		const comments: IssueComment[] = [];
		let page = 1;

		while (true) {
			const pageComments = await this.request<IssueComment[]>(
				`/repos/${this.repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
			);
			comments.push(...pageComments);
			if (pageComments.length < 100) break;
			page += 1;
		}

		return comments;
	}

	async createComment(issueNumber: number, body: string): Promise<void> {
		await this.request(`/repos/${this.repository}/issues/${issueNumber}/comments`, {
			method: "POST",
			body: JSON.stringify({ body }),
		});
	}

	async updateComment(commentId: number, body: string): Promise<void> {
		await this.request(`/repos/${this.repository}/issues/comments/${commentId}`, {
			method: "PATCH",
			body: JSON.stringify({ body }),
		});
	}

	async deleteComment(commentId: number): Promise<void> {
		await this.request(`/repos/${this.repository}/issues/comments/${commentId}`, { method: "DELETE" });
	}
}

export async function reconcileManagedComment(options: {
	client: Pick<GitHubClient, "fetchComments" | "createComment" | "updateComment" | "deleteComment">;
	issueNumber: number;
	result: LabelHealthResult;
}): Promise<"created" | "updated" | "deleted" | "unchanged"> {
	const comments = await options.client.fetchComments(options.issueNumber);
	const managedComments = comments.filter((comment) => comment.body?.includes(MANAGED_COMMENT_MARKER));
	const [firstManagedComment, ...extraManagedComments] = managedComments;

	for (const comment of extraManagedComments) {
		await options.client.deleteComment(comment.id);
	}

	if (options.result.problems.length === 0) {
		if (!firstManagedComment) return "unchanged";
		await options.client.deleteComment(firstManagedComment.id);
		return "deleted";
	}

	const body = renderWarningComment(options.result);
	if (!firstManagedComment) {
		await options.client.createComment(options.issueNumber, body);
		return "created";
	}

	if (firstManagedComment.body === body && extraManagedComments.length === 0) {
		return "unchanged";
	}

	await options.client.updateComment(firstManagedComment.id, body);
	return "updated";
}

async function main(): Promise<void> {
	const repository = process.env.GITHUB_REPOSITORY;
	const token = process.env.GITHUB_TOKEN;
	const issueNumber = Number(process.env.ISSUE_NUMBER);

	if (!repository) throw new Error("GITHUB_REPOSITORY is required");
	if (!token) throw new Error("GITHUB_TOKEN is required");
	if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error("ISSUE_NUMBER must be a positive integer");

	const client = new GitHubClient(repository, token);
	const [issueLabels, repositoryLabels] = await Promise.all([client.fetchIssueLabels(issueNumber), client.fetchRepositoryLabels()]);
	const result = analyzeIssueLabelHealth({ issueLabels, repositoryLabels });
	const action = await reconcileManagedComment({ client, issueNumber, result });

	console.log(JSON.stringify({ issueNumber, problems: result.problems.length, action }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main();
}
