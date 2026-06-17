import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const sharedAppendSystemPath = path.join(packageRoot, "shared", "SHARED_APPEND_SYSTEM.md");

const PROJECT_CONTEXT_MARKER = "<project_context>";
const CURRENT_DATE_MARKER = "\nCurrent date:";
const CURRENT_WORKING_DIRECTORY_MARKER = "\nCurrent working directory:";
export const VERBOSITY_STEERING_PROMPT = "Be terse; avoid restating existing context unless it is necessary.";

export async function loadSharedAppendSystemInstructions(): Promise<string> {
	try {
		return (await readFile(sharedAppendSystemPath, "utf8")).trim();
	} catch {
		return "";
	}
}

export function formatSharedAppendSystemPrompt(sharedAppendSystemInstructions: string): string {
	if (!sharedAppendSystemInstructions) return "";
	return `<shared_append_system_context>
Shared package append-system instructions and guidelines:

<shared_append_system_instructions path="${sharedAppendSystemPath}">
${sharedAppendSystemInstructions}
</shared_append_system_instructions>
</shared_append_system_context>`;
}

export function insertSharedAppendSystemPrompt(
	systemPrompt: string,
	sharedAppendSystemPrompt: string,
	appendSystemPrompt?: string,
): string {
	if (!sharedAppendSystemPrompt) return systemPrompt;
	if (systemPrompt.includes(sharedAppendSystemPrompt)) return systemPrompt;

	const sharedBlock = `${sharedAppendSystemPrompt}\n\n`;
	if (appendSystemPrompt) {
		const appendIndex = systemPrompt.indexOf(appendSystemPrompt);
		if (appendIndex !== -1) {
			return `${systemPrompt.slice(0, appendIndex)}${sharedBlock}${systemPrompt.slice(appendIndex)}`;
		}
	}

	const projectContextIndex = systemPrompt.indexOf(PROJECT_CONTEXT_MARKER);
	if (projectContextIndex !== -1) {
		return `${systemPrompt.slice(0, projectContextIndex)}${sharedBlock}${systemPrompt.slice(projectContextIndex)}`;
	}

	const currentDateIndex = systemPrompt.indexOf(CURRENT_DATE_MARKER);
	if (currentDateIndex !== -1) {
		return `${systemPrompt.slice(0, currentDateIndex)}\n\n${sharedBlock}${systemPrompt.slice(currentDateIndex + 1)}`;
	}

	return `${systemPrompt}\n\n${sharedAppendSystemPrompt}`;
}

export function appendVerbositySteeringPrompt(systemPrompt: string): string {
	if (systemPrompt.includes(VERBOSITY_STEERING_PROMPT)) return systemPrompt;

	const currentDateIndex = systemPrompt.indexOf(CURRENT_DATE_MARKER);
	if (currentDateIndex !== -1) {
		return `${systemPrompt.slice(0, currentDateIndex)}\n\n${VERBOSITY_STEERING_PROMPT}${systemPrompt.slice(currentDateIndex)}`;
	}

	const currentWorkingDirectoryIndex = systemPrompt.indexOf(CURRENT_WORKING_DIRECTORY_MARKER);
	if (currentWorkingDirectoryIndex !== -1) {
		return `${systemPrompt.slice(0, currentWorkingDirectoryIndex)}\n\n${VERBOSITY_STEERING_PROMPT}${systemPrompt.slice(currentWorkingDirectoryIndex)}`;
	}

	return `${systemPrompt}\n\n${VERBOSITY_STEERING_PROMPT}`;
}
