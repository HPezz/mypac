#!/usr/bin/env -S node --experimental-strip-types
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { analyzeLabels, buildApplyPlan, countPlannedChanges, hasCleanRequiredLabels, normalizeColor } from "../extensions/pac-setup-workflows/drift.ts";
import { parsePaginatedLabels } from "../extensions/pac-setup-workflows/github.ts";
import { renderApplyPlan, renderApplyResults, renderCheckResult } from "../extensions/pac-setup-workflows/render.ts";
import type { ApplyOperationResult, GitHubLabel, LabelCheckResult, LabelSpec, ParsedCommand } from "../extensions/pac-setup-workflows/types.ts";

const execFileAsync = promisify(execFile);

type CliCommand = Exclude<ParsedCommand, { action: "menu" | "error" }> & { yes: boolean };
type CliParseResult = CliCommand | { action: "error"; message: string; yes: boolean };
type GhResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isOwnerRepo(value: string): boolean {
	return /^[^\s/]+\/[^\s/]+$/.test(value);
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
			if (!value) return { action: "error", message: "--repo requires owner/repo", yes };
			if (!isOwnerRepo(value)) return { action: "error", message: `Invalid --repo value: ${value}`, yes };
			repo = value;
			index++;
			continue;
		}
		if (arg.startsWith("--repo=")) {
			const value = arg.slice("--repo=".length);
			if (!isOwnerRepo(value)) return { action: "error", message: `Invalid --repo value: ${value}`, yes };
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

async function runGh(args: string[]): Promise<GhResult<string>> {
	try {
		const result = await execFileAsync("gh", args, { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });
		return { ok: true, value: result.stdout };
	} catch (error) {
		if (error && typeof error === "object" && "stderr" in error) {
			const execError = error as { stderr?: string; stdout?: string; message?: string; code?: unknown };
			const errorOutput = [execError.stderr?.trim(), execError.stdout?.trim()].filter(Boolean).join("\n");
			return { ok: false, error: errorOutput || execError.message || `gh ${args.join(" ")} failed` };
		}
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

function renderCliHelp(): string {
	return [
		"# pac-setup-workflows",
		"",
		"Check and apply canonical pac GitHub workflow labels.",
		"",
		"Usage:",
		"",
		"```text",
		"pac-setup-workflows",
		"pac-setup-workflows labels check",
		"pac-setup-workflows labels apply",
		"pac-setup-workflows labels check --repo owner/repo",
		"pac-setup-workflows labels apply --repo owner/repo",
		"pac-setup-workflows labels apply --repo owner/repo --yes",
		"```",
		"",
		"Check mode is dry-run. Apply mode requires typing `yes` interactively or passing `--yes` before creating labels, updating pac:* metadata, or renaming known legacy labels.",
	].join("\n");
}

function setupError(message: string): string {
	return [
		"Could not inspect GitHub labels.",
		"",
		"Prerequisites:",
		"- Run inside a GitHub repository or pass `--repo owner/repo`.",
		"- Install GitHub CLI (`gh`).",
		"- Authenticate with `gh auth login`.",
		"",
		"Details:",
		message,
	].join("\n");
}

async function resolveRepo(repo?: string): Promise<GhResult<string>> {
	if (repo) return { ok: true, value: repo };
	const result = await runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
	if (!result.ok) return result;
	const value = result.value.trim();
	if (!/^[^\s/]+\/[^\s/]+$/.test(value)) return { ok: false, error: "Could not infer GitHub repository. Pass --repo owner/repo." };
	return { ok: true, value };
}

async function fetchLabels(repo: string): Promise<GhResult<GitHubLabel[]>> {
	const result = await runGh(["api", "--paginate", "--slurp", `repos/${repo}/labels?per_page=100`]);
	if (!result.ok) return result;
	try {
		return { ok: true, value: parsePaginatedLabels(result.value) };
	} catch (error) {
		return { ok: false, error: `Could not parse gh api labels output: ${error instanceof Error ? error.message : String(error)}` };
	}
}

async function renameLabel(repo: string, legacyName: string, target: LabelSpec): Promise<ApplyOperationResult> {
	const result = await runGh([
		"label",
		"edit",
		legacyName,
		"--repo",
		repo,
		"--name",
		target.name,
		"--color",
		normalizeColor(target.color),
		"--description",
		target.description,
	]);

	return {
		action: "rename",
		label: legacyName,
		target: target.name,
		success: result.ok,
		message: result.ok ? "renamed and metadata updated" : result.error,
	};
}

async function createLabel(repo: string, label: LabelSpec): Promise<ApplyOperationResult> {
	const result = await runGh([
		"label",
		"create",
		label.name,
		"--repo",
		repo,
		"--color",
		normalizeColor(label.color),
		"--description",
		label.description,
	]);

	return {
		action: "create",
		label: label.name,
		success: result.ok,
		message: result.ok ? "created" : result.error,
	};
}

async function updateLabel(repo: string, label: LabelSpec): Promise<ApplyOperationResult> {
	const result = await runGh([
		"label",
		"edit",
		label.name,
		"--repo",
		repo,
		"--color",
		normalizeColor(label.color),
		"--description",
		label.description,
	]);

	return {
		action: "update",
		label: label.name,
		success: result.ok,
		message: result.ok ? "metadata updated" : result.error,
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

async function checkLabels(repoArg?: string): Promise<{ repo: string; result: LabelCheckResult } | undefined> {
	const resolved = await resolveRepo(repoArg);
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
	console.log(renderCheckResult(resolved.value, result));
	return { repo: resolved.value, result };
}

async function applyLabels(repoArg: string | undefined, yes: boolean): Promise<number> {
	const check = await checkLabels(repoArg);
	if (!check) return 1;

	const result = check.result;
	const plan = buildApplyPlan(result);
	const changeCount = countPlannedChanges(plan);
	console.log("\n" + renderApplyPlan(check.repo, plan));

	if (changeCount === 0) {
		console.log("\nNo pac workflow label changes needed.");
		return hasCleanRequiredLabels(result) ? 0 : 1;
	}

	if (!yes && !(await confirmApply(check.repo, changeCount))) {
		console.error("Pac workflow label apply cancelled.");
		return 1;
	}

	const results: ApplyOperationResult[] = [];
	for (const rename of plan.renames) {
		results.push(await renameLabel(check.repo, rename.mapping.legacy, rename.expected));
	}
	for (const create of plan.creates) {
		results.push(await createLabel(check.repo, create));
	}
	for (const update of plan.updates) {
		results.push(await updateLabel(check.repo, update.expected));
	}

	console.log("\n" + renderApplyResults(check.repo, results));
	return results.every((result) => result.success) ? 0 : 1;
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = await main();
}
