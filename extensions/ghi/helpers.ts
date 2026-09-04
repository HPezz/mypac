import type { ForgeRepository } from "../../lib/forge.ts";
import { buildWorkflowSessionName } from "../session-names/helpers.ts";

export function normalizeIssueNote(input: string): string {
	return input.trim();
}

export function buildIssueSessionName(note: string): string | undefined {
	return buildWorkflowSessionName("ghi", note);
}

export function findExplicitForgeUrl(input: string): string | undefined {
	const match = input.match(/https?:\/\/[^\s<>]+/i);
	return match?.[0].replace(/[),.;:!?]+$/, "");
}

export function buildIssueCreatePrompt(
	skillContent: string,
	note: string,
	repository: ForgeRepository,
): string {
	const forge = repository.provider === "github" ? "GitHub" : "GitLab";
	const cli = repository.provider === "github" ? "gh" : "glab";
	return [
		skillContent.trim(),
		"",
		"---",
		"",
		`Create a ${forge} issue for ${repository.host}/${repository.project} with ${cli} based on the note below.`,
		"Stay within this create-only /issue-create workflow. /ghi is a backward-compatible alias.",
		"Infer and apply an existing pac workflow state label when the user's intent is clear.",
		"If the note is too ambiguous to create a useful issue or choose a pac state label, ask at most one brief follow-up question before creating it.",
		"",
		"Issue note:",
		normalizeIssueNote(note),
	].join("\n");
}
