import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveForgeRepository, type ForgeRepository, type ForgeResult } from "../../lib/forge.ts";
import { createLabel, fetchLabels, renameLabel, updateLabel } from "./github.ts";
import { createGitLabLabel, fetchGitLabLabels, renameGitLabLabel, updateGitLabLabel } from "./gitlab.ts";
import type { ApplyOperationResult, DriftedLabel, ForgeLabel, LabelSpec, LegacyMigrationCandidate } from "./types.ts";

export async function resolveSetupRepository(
	pi: ExtensionAPI,
	repo?: string,
): Promise<ForgeResult<ForgeRepository>> {
	if (repo && /^[^\s/]+\/[^\s/]+$/.test(repo)) {
		return { ok: true, value: { provider: "github", host: "github.com", project: repo } };
	}
	return resolveForgeRepository(
		(command, args) => pi.exec(command, args, { timeout: 30_000 }),
		repo ? { explicitUrl: repo } : {},
	);
}

export function displayRepository(repository: ForgeRepository): string {
	return `${repository.host}/${repository.project}`;
}

export async function fetchProviderLabels(
	pi: ExtensionAPI,
	repository: ForgeRepository,
): Promise<ForgeResult<ForgeLabel[]>> {
	return repository.provider === "github"
		? fetchLabels(pi, repository.host === "github.com" ? repository.project : `${repository.host}/${repository.project}`)
		: fetchGitLabLabels(pi, repository);
}

export async function renameProviderLabel(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	candidate: LegacyMigrationCandidate,
): Promise<ApplyOperationResult> {
	return repository.provider === "github"
		? renameLabel(pi, repository.project, candidate.mapping.legacy, candidate.expected)
		: renameGitLabLabel(pi, repository, candidate.legacyLabel, candidate.expected);
}

export async function createProviderLabel(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	label: LabelSpec,
): Promise<ApplyOperationResult> {
	return repository.provider === "github"
		? createLabel(pi, repository.project, label)
		: createGitLabLabel(pi, repository, label);
}

export async function updateProviderLabel(
	pi: ExtensionAPI,
	repository: ForgeRepository,
	drift: DriftedLabel,
): Promise<ApplyOperationResult> {
	return repository.provider === "github"
		? updateLabel(pi, repository.project, drift.expected)
		: updateGitLabLabel(pi, repository, drift.actual, drift.expected);
}
