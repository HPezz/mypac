export type IssueTarget =
	| { kind: "number"; number: number }
	| { kind: "url"; owner: string; repo: string; number: number };

export type WorktrunkListEntry = {
	branch: string | null;
	path?: string;
};

export function parseIssueTarget(input: string): IssueTarget | null {
	const value = input.trim();
	if (!value) return null;

	if (/^\d+$/.test(value)) {
		return { kind: "number", number: Number(value) };
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}

	if (url.hostname !== "github.com") return null;
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts.length < 4 || parts[2] !== "issues" || !/^\d+$/.test(parts[3])) return null;

	return {
		kind: "url",
		owner: parts[0],
		repo: parts[1],
		number: Number(parts[3]),
	};
}

export function slugifyIssueTitle(title: string): string {
	return title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

export function buildIssueBranch(number: number, title: string, firstName = "ladislas"): string {
	const slug = slugifyIssueTitle(title) || `issue-${number}`;
	return `${firstName}/feature/${number}-${slug}`;
}

export function parseWorktrunkList(output: string): WorktrunkListEntry[] {
	const parsed = JSON.parse(output || "[]") as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error("expected wt list output to be a JSON array");
	}

	return parsed.map((item) => {
		const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
		return {
			branch: typeof record.branch === "string" ? record.branch : null,
			path: typeof record.path === "string" && record.path.length > 0 ? record.path : undefined,
		};
	});
}

export function findWorktreeByBranch(entries: WorktrunkListEntry[], branch: string): WorktrunkListEntry | undefined {
	return entries.find((entry) => entry.branch === branch);
}

export function formatIssueWorktreeSummary(input: {
	created: boolean;
	issueNumber: number;
	issueTitle: string;
	branch: string;
	path: string;
}): string {
	const status = input.created ? "Created worktree" : "Reusing existing worktree";
	return [
		`${status} for #${input.issueNumber}: ${input.issueTitle}`,
		`Branch: ${input.branch}`,
		`Path: ${input.path}`,
		"",
		"Next:",
		`cd ${shellQuote(input.path)} && pi`,
	].join("\n");
}

function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_/:=.,+@%-]+$/.test(value)) return value;
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}
