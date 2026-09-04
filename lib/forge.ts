export type ForgeProvider = "github" | "gitlab";

export type ForgeRepository = {
	provider: ForgeProvider;
	host: string;
	project: string;
	remote?: string;
};

export type ForgeReference = Omit<ForgeRepository, "remote"> & {
	kind: "issue" | "change";
	number: number;
	url: string;
};

export type ExecResult = { code: number; stdout: string; stderr: string };
export type ForgeExec = (command: string, args: string[]) => Promise<ExecResult>;
export type ForgeResult<T> = { ok: true; value: T } | { ok: false; error: string };

type ParsedRemote = { host: string; project: string };

function positiveNumber(value: string | undefined): number | null {
	if (!value || !/^\d+$/.test(value)) return null;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseForgeReference(input: string): ForgeReference | null {
	let parsed: URL;
	try {
		parsed = new URL(input.trim());
	} catch {
		return null;
	}

	const parts = parsed.pathname.split("/").filter(Boolean);
	if (parsed.hostname.toLowerCase() === "github.com" && parts.length >= 4) {
		const kind = parts[2] === "issues" ? "issue" : parts[2] === "pull" ? "change" : null;
		const number = positiveNumber(parts[3]);
		if (!kind || number === null) return null;
		const project = `${parts[0]}/${parts[1]}`;
		return {
			provider: "github",
			host: parsed.host,
			project,
			kind,
			number,
			url: `${parsed.protocol}//${parsed.host}/${project}/${parts[2]}/${number}`,
		};
	}

	const separator = parts.lastIndexOf("-");
	if (separator <= 0 || separator + 2 >= parts.length) return null;
	const resource = parts[separator + 1];
	const kind = resource === "issues" ? "issue" : resource === "merge_requests" ? "change" : null;
	const number = positiveNumber(parts[separator + 2]);
	if (!kind || number === null) return null;
	const project = parts.slice(0, separator).join("/");
	return {
		provider: "gitlab",
		host: parsed.host,
		project,
		kind,
		number,
		url: `${parsed.protocol}//${parsed.host}/${project}/-/${resource}/${number}`,
	};
}

export function parseGitRemoteUrl(input: string): ParsedRemote | null {
	const value = input.trim();
	if (!value) return null;

	let host: string;
	let pathname: string;
	const scpMatch = value.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
	if (scpMatch && !value.includes("://")) {
		host = scpMatch[1];
		pathname = scpMatch[2];
	} else {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			return null;
		}
		host = url.hostname;
		pathname = url.pathname;
	}

	const project = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
	if (!host || !project || !project.includes("/")) return null;
	return { host: host.toLowerCase(), project };
}

async function detectProvider(exec: ForgeExec, host: string): Promise<ForgeResult<ForgeProvider>> {
	if (host === "github.com") return { ok: true, value: "github" };
	if (host === "gitlab.com") return { ok: true, value: "gitlab" };

	const [gitlab, github] = await Promise.all([
		exec("glab", ["auth", "status", "--hostname", host]),
		exec("gh", ["auth", "status", "--hostname", host]),
	]);
	if (gitlab.code === 0 && github.code !== 0) return { ok: true, value: "gitlab" };
	if (github.code === 0 && gitlab.code !== 0) return { ok: true, value: "github" };
	if (github.code === 0 && gitlab.code === 0) {
		return {
			ok: false,
			error: `Forge is ambiguous for ${host}. Ask for an explicit GitHub or GitLab URL.`,
		};
	}
	return {
		ok: false,
		error: `Could not identify the forge for ${host}. Authenticate gh or glab for that host, or provide an explicit GitHub or GitLab URL.`,
	};
}

async function repositoryFromRemote(
	exec: ForgeExec,
	remote: string,
	remoteUrl: string,
): Promise<ForgeResult<ForgeRepository>> {
	const parsed = parseGitRemoteUrl(remoteUrl);
	if (!parsed) return { ok: false, error: `Could not parse the ${remote} remote URL.` };
	const provider = await detectProvider(exec, parsed.host);
	if (!provider.ok) return provider;
	return { ok: true, value: { ...parsed, provider: provider.value, remote } };
}

async function resolveRemote(exec: ForgeExec, remote: string): Promise<ForgeResult<ForgeRepository>> {
	const result = await exec("git", ["remote", "get-url", remote]);
	if (result.code !== 0 || !result.stdout.trim()) {
		return { ok: false, error: `Could not read the ${remote} remote URL.` };
	}
	return repositoryFromRemote(exec, remote, result.stdout);
}

export async function resolveForgeRepository(
	exec: ForgeExec,
	options: { explicitUrl?: string } = {},
): Promise<ForgeResult<ForgeRepository>> {
	if (options.explicitUrl) {
		const reference = parseForgeReference(options.explicitUrl);
		if (reference) {
			return {
				ok: true,
				value: { provider: reference.provider, host: reference.host, project: reference.project },
			};
		}

		const remote = parseGitRemoteUrl(options.explicitUrl);
		if (!remote) return { ok: false, error: "The explicit forge URL is not a valid repository or issue URL." };
		const provider = await detectProvider(exec, remote.host);
		return provider.ok
			? { ok: true, value: { ...remote, provider: provider.value } }
			: provider;
	}

	const branch = await exec("git", ["branch", "--show-current"]);
	if (branch.code === 0 && branch.stdout.trim()) {
		const tracking = await exec("git", ["config", "--get", `branch.${branch.stdout.trim()}.remote`]);
		const remote = tracking.stdout.trim();
		if (tracking.code === 0 && remote && remote !== ".") {
			return resolveRemote(exec, remote);
		}
	}

	const origin = await resolveRemote(exec, "origin");
	if (origin.ok) return origin;
	return {
		ok: false,
		error: `${origin.error} Ask for an explicit GitHub or GitLab URL rather than guessing.`,
	};
}
