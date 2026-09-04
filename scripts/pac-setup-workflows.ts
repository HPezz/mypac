#!/usr/bin/env -S node --experimental-strip-types
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { resolveForgeRepository, type ExecResult, type ForgeRepository, type ForgeResult } from "../lib/forge.ts";
import { analyzeLabels, buildApplyPlan, countPlannedChanges, hasCleanRequiredLabels, normalizeColor } from "../extensions/pac-setup-workflows/drift.ts";
import { parsePaginatedLabels } from "../extensions/pac-setup-workflows/github.ts";
import { parseGitLabLabels } from "../extensions/pac-setup-workflows/gitlab.ts";
import { renderApplyPlan, renderApplyResults, renderCheckResult } from "../extensions/pac-setup-workflows/render.ts";
import type { ApplyOperationResult, ForgeLabel, LabelCheckResult, LabelSpec, ParsedCommand } from "../extensions/pac-setup-workflows/types.ts";

const execFileAsync = promisify(execFile);

type CliCommand = Exclude<ParsedCommand, { action: "menu" | "error" }> & { yes: boolean };
type CliParseResult = CliCommand | { action: "error"; message: string; yes: boolean };

type CheckContext = { repository: ForgeRepository; displayRepo: string; result: LabelCheckResult };

function isRepoTarget(value: string): boolean {
	if (/^[^\s/]+\/[^\s/]+$/.test(value)) return true;
	try {
		const url = new URL(value);
		return /^https?:$/.test(url.protocol) && url.pathname.split("/").filter(Boolean).length >= 2;
	} catch {
		return false;
	}
}

export function parseCliCommand(argv: string[]): CliParseResult {
	const rest: string[] = [];
	let repo: string | undefined;
	let yes = false;

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--yes" || arg === "-y") {
			yes = true;
			continue;
		}
		if (arg === "--repo") {
			const value = argv[index + 1];
			if (!value) return { action: "error", message: "--repo requires owner/repo or a forge URL", yes };
			if (!isRepoTarget(value)) return { action: "error", message: `Invalid --repo value: ${value}`, yes };
			repo = value;
			index++;
			continue;
		}
		if (arg.startsWith("--repo=")) {
			const value = arg.slice("--repo=".length);
			if (!isRepoTarget(value)) return { action: "error", message: `Invalid --repo value: ${value}`, yes };
			repo = value;
			continue;
		}
		rest.push(arg);
	}

	if (rest.length === 0) return { action: "check", repo, yes };
	if (rest.length === 1 && (rest[0] === "help" || rest[0] === "--help" || rest[0] === "-h")) return { action: "help", repo, yes };
	if (rest.length === 2 && rest[0] === "labels" && rest[1] === "check") return { action: "check", repo, yes };
	if (rest.length === 2 && rest[0] === "labels" && rest[1] === "apply") return { action: "apply", repo, yes };
	return { action: "error", message: `Unknown arguments: ${rest.join(" ")}`, yes };
}

export function isAffirmativeConfirmation(value: string): boolean {
	return value.trim().toLowerCase() === "yes";
}

async function runCommand(command: string, args: string[]): Promise<ExecResult> {
	try {
		const result = await execFileAsync(command, args, { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });
		return { code: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		if (error && typeof error === "object") {
			const execError = error as { stderr?: string; stdout?: string; message?: string; code?: unknown };
			return {
				code: typeof execError.code === "number" ? execError.code : 1,
				stdout: execError.stdout ?? "",
				stderr: execError.stderr ?? execError.message ?? String(error),
			};
		}
		return { code: 1, stdout: "", stderr: String(error) };
	}
}

function resultError(command: string, args: string[], result: ExecResult): string {
	return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n") || `${command} ${args.join(" ")} failed`;
}

function renderCliHelp(): string {
	return [
		"# pac-setup-workflows",
		"",
		"Check and apply canonical pac workflow labels on GitHub or GitLab.",
		"",
		"Usage:",
		"",
		"```text",
		"pac-setup-workflows",
		"pac-setup-workflows labels check",
		"pac-setup-workflows labels apply",
		"pac-setup-workflows labels check --repo owner/repo",
		"pac-setup-workflows labels check --repo https://git.example.com/group/project",
		"pac-setup-workflows labels apply --repo owner/repo --yes",
		"```",
		"",
		"Check mode is dry-run. Apply mode requires typing `yes` interactively or passing `--yes`.",
	].join("\n");
}

function setupError(message: string): string {
	return [
		"Could not inspect forge labels.",
		"",
		"Prerequisites:",
		"- Run inside a GitHub or GitLab repository, or pass an explicit repository URL.",
		"- Install and authenticate the matching CLI (`gh` or `glab`).",
		"",
		"Details:",
		message,
	].join("\n");
}

async function resolveRepository(repo?: string): Promise<ForgeResult<ForgeRepository>> {
	if (repo && /^[^\s/]+\/[^\s/]+$/.test(repo)) {
		return { ok: true, value: { provider: "github", host: "github.com", project: repo } };
	}
	return resolveForgeRepository(runCommand, repo ? { explicitUrl: repo } : {});
}

function githubRepo(repository: ForgeRepository): string {
	return repository.host === "github.com" ? repository.project : `${repository.host}/${repository.project}`;
}

function gitlabRepo(repository: ForgeRepository): string {
	return `https://${repository.host}/${repository.project}`;
}

async function fetchLabels(repository: ForgeRepository): Promise<ForgeResult<ForgeLabel[]>> {
	if (repository.provider === "github") {
		const args = ["api", "--paginate", "--slurp", `repos/${repository.project}/labels?per_page=100`];
		const result = await runCommand("gh", args);
		if (result.code !== 0) return { ok: false, error: resultError("gh", args, result) };
		try {
			return { ok: true, value: parsePaginatedLabels(result.stdout) };
		} catch (error) {
			return { ok: false, error: `Could not parse gh labels output: ${error instanceof Error ? error.message : String(error)}` };
		}
	}

	const args = [
		"api", "--hostname", repository.host, "--paginate",
		`projects/${encodeURIComponent(repository.project)}/labels?include_ancestor_groups=true&per_page=100`,
	];
	const result = await runCommand("glab", args);
	if (result.code !== 0) return { ok: false, error: resultError("glab", args, result) };
	try {
		return { ok: true, value: parseGitLabLabels(result.stdout) };
	} catch (error) {
		return { ok: false, error: `Could not parse glab labels output: ${error instanceof Error ? error.message : String(error)}` };
	}
}

async function mutateLabel(
	repository: ForgeRepository,
	action: "rename" | "create" | "update",
	label: LabelSpec,
	actual?: ForgeLabel,
): Promise<ApplyOperationResult> {
	if (actual?.scope === "group") {
		return { action, label: actual.name, target: action === "rename" ? label.name : undefined, success: false, message: "inherited group labels are read-only" };
	}

	let command: string;
	let args: string[];
	if (repository.provider === "github") {
		command = "gh";
		if (action === "create") {
			args = ["label", "create", label.name, "--repo", githubRepo(repository), "--color", normalizeColor(label.color), "--description", label.description];
		} else {
			args = ["label", "edit", actual?.name ?? label.name, "--repo", githubRepo(repository)];
			if (action === "rename") args.push("--name", label.name);
			args.push("--color", normalizeColor(label.color), "--description", label.description);
		}
	} else {
		command = "glab";
		if (action === "create") {
			args = ["label", "create", "--repo", gitlabRepo(repository), "--name", label.name, "--color", `#${normalizeColor(label.color)}`, "--description", label.description];
		} else {
			if (actual?.id === undefined) return { action, label: actual?.name ?? label.name, success: false, message: "GitLab project label ID is missing" };
			args = ["label", "edit", "--repo", gitlabRepo(repository), "--label-id", String(actual.id)];
			if (action === "rename") args.push("--new-name", label.name);
			args.push("--color", `#${normalizeColor(label.color)}`, "--description", label.description);
		}
	}

	const result = await runCommand(command, args);
	return {
		action,
		label: actual?.name ?? label.name,
		target: action === "rename" ? label.name : undefined,
		success: result.code === 0,
		message: result.code === 0 ? action === "create" ? "created" : action === "rename" ? "renamed and metadata updated" : "metadata updated" : resultError(command, args, result),
	};
}

async function confirmApply(repo: string, changeCount: number): Promise<boolean> {
	if (!process.stdin.isTTY) {
		console.error("Apply mode requires explicit confirmation. Re-run with --yes to apply non-interactively.");
		return false;
	}
	const rl = createInterface({ input, output });
	try {
		const answer = await rl.question(`Apply ${changeCount} pac workflow label change(s) to ${repo}? Type yes to continue: `);
		return isAffirmativeConfirmation(answer);
	} finally {
		rl.close();
	}
}

async function checkLabels(repoArg?: string): Promise<CheckContext | undefined> {
	const resolved = await resolveRepository(repoArg);
	if (!resolved.ok) {
		console.error(setupError(resolved.error));
		return;
	}
	const labels = await fetchLabels(resolved.value);
	if (!labels.ok) {
		console.error(setupError(labels.error));
		return;
	}
	const result = analyzeLabels(labels.value);
	const displayRepo = `${resolved.value.host}/${resolved.value.project}`;
	console.log(renderCheckResult(displayRepo, result));
	return { repository: resolved.value, displayRepo, result };
}

async function applyLabels(repoArg: string | undefined, yes: boolean): Promise<number> {
	const check = await checkLabels(repoArg);
	if (!check) return 1;
	const plan = buildApplyPlan(check.result);
	const changeCount = countPlannedChanges(plan);
	console.log("\n" + renderApplyPlan(check.displayRepo, plan));
	if (changeCount === 0) {
		console.log("\nNo pac workflow label changes needed.");
		return hasCleanRequiredLabels(check.result) ? 0 : 1;
	}
	if (!yes && !(await confirmApply(check.displayRepo, changeCount))) {
		console.error("Pac workflow label apply cancelled.");
		return 1;
	}

	const results: ApplyOperationResult[] = [];
	for (const rename of plan.renames) results.push(await mutateLabel(check.repository, "rename", rename.expected, rename.legacyLabel));
	for (const create of plan.creates) results.push(await mutateLabel(check.repository, "create", create));
	for (const update of plan.updates) results.push(await mutateLabel(check.repository, "update", update.expected, update.actual));
	console.log("\n" + renderApplyResults(check.displayRepo, results));
	if (!results.every((result) => result.success)) return 1;

	const verification = await checkLabels(`https://${check.repository.host}/${check.repository.project}`);
	return verification && hasCleanRequiredLabels(verification.result) ? 0 : 1;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
	const command = parseCliCommand(argv);
	if (command.action === "error") {
		console.error(`${command.message}\n\n${renderCliHelp()}`);
		return 2;
	}
	if (command.action === "help") {
		console.log(renderCliHelp());
		return 0;
	}
	if (command.action === "check") {
		const check = await checkLabels(command.repo);
		return check && hasCleanRequiredLabels(check.result) ? 0 : 1;
	}
	return applyLabels(command.repo, command.yes);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main();
