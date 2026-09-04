import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ForgeRepository } from "../../lib/forge.ts";
import { normalizeColor } from "./drift.ts";
import type { ApplyOperationResult, ForgeLabel, LabelSpec } from "./types.ts";

type GlabResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function runGlab(pi: ExtensionAPI, args: string[]): Promise<GlabResult<string>> {
	const result = await pi.exec("glab", args, { timeout: 30_000 });
	if (result.code !== 0) {
		const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
		return { ok: false, error: output || `glab ${args.join(" ")} failed with exit code ${result.code}` };
	}
	return { ok: true, value: result.stdout };
}

function projectUrl(repository: ForgeRepository): string {
	return `https://${repository.host}/${repository.project}`;
}

export function parseGitLabLabels(output: string): ForgeLabel[] {
	const parsed = JSON.parse(output) as unknown;
	if (!Array.isArray(parsed)) throw new Error("expected GitLab labels response to be an array");
	const records = parsed.flatMap((item) => Array.isArray(item) ? item : [item]);
	return records.map((item) => {
		if (!item || typeof item !== "object") throw new Error("expected each GitLab label to be an object");
		const label = item as Record<string, unknown>;
		if (typeof label.id !== "number") throw new Error("expected label.id to be a number");
		if (typeof label.name !== "string") throw new Error("expected label.name to be a string");
		if (typeof label.color !== "string") throw new Error(`expected label.color for ${label.name} to be a string`);
		return {
			id: label.id,
			name: label.name,
			color: label.color,
			description: typeof label.description === "string" || label.description === null ? label.description : undefined,
			scope: label.is_project_label === false ? "group" : "project",
		};
	});
}

export async function fetchGitLabLabels(pi: ExtensionAPI, repository: ForgeRepository): Promise<GlabResult<ForgeLabel[]>> {
	const encodedProject = encodeURIComponent(repository.project);
	const result = await runGlab(pi, [
		"api",
		"--hostname",
		repository.host,
		"--paginate",
		`projects/${encodedProject}/labels?include_ancestor_groups=true&per_page=100`,
	]);
	if (!result.ok) return result;
	try {
		return { ok: true, value: parseGitLabLabels(result.value) };
	} catch (error) {
		return { ok: false, error: `Could not parse glab labels output: ${error instanceof Error ? error.message : String(error)}` };
	}
}

export async function renameGitLabLabel(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	legacy: ForgeLabel,
	target: LabelSpec,
): Promise<ApplyOperationResult> {
	if (legacy.scope === "group" || legacy.id === undefined) {
		return { action: "rename", label: legacy.name, target: target.name, success: false, message: "inherited group labels are read-only" };
	}
	const result = await runGlab(pi, [
		"label", "edit", "--repo", projectUrl(repository), "--label-id", String(legacy.id),
		"--new-name", target.name, "--color", `#${normalizeColor(target.color)}`, "--description", target.description,
	]);
	return { action: "rename", label: legacy.name, target: target.name, success: result.ok, message: result.ok ? "renamed and metadata updated" : result.error };
}

export async function createGitLabLabel(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	label: LabelSpec,
): Promise<ApplyOperationResult> {
	const result = await runGlab(pi, [
		"label", "create", "--repo", projectUrl(repository), "--name", label.name,
		"--color", `#${normalizeColor(label.color)}`, "--description", label.description,
	]);
	return { action: "create", label: label.name, success: result.ok, message: result.ok ? "created" : result.error };
}

export async function updateGitLabLabel(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	actual: ForgeLabel,
	label: LabelSpec,
): Promise<ApplyOperationResult> {
	if (actual.scope === "group" || actual.id === undefined) {
		return { action: "update", label: actual.name, success: false, message: "inherited group labels are read-only" };
	}
	const result = await runGlab(pi, [
		"label", "edit", "--repo", projectUrl(repository), "--label-id", String(actual.id),
		"--color", `#${normalizeColor(label.color)}`, "--description", label.description,
	]);
	return { action: "update", label: label.name, success: result.ok, message: result.ok ? "metadata updated" : result.error };
}
