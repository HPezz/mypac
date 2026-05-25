import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const PERSONA_STATE_TYPE = "persona-state";

const PROJECT_CONTEXT_MARKER = "<project_context>";
const CURRENT_DATE_MARKER = "\nCurrent date:";

export interface Persona {
	name: string;
	description?: string;
	relativePath: string;
	content: string;
}

export interface PersonaState {
	activePersona?: string;
}

type PersonaStateEntry = {
	type: string;
	customType?: string;
	data?: unknown;
};

export type PersonaCommand =
	| { action: "list" }
	| { action: "off" }
	| { action: "select"; name: string };

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; content: string } {
	const normalized = raw.trimStart().replace(/^\uFEFF/, "").trimStart();
	const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { frontmatter: {}, content: normalized.trim() };

	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!field) continue;
		frontmatter[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, "");
	}

	return { frontmatter, content: normalized.slice(match[0].length).trim() };
}

function normalizePersonaName(input: string): string {
	return input.trim().toLowerCase();
}

export async function loadPersonas(rootDir: string): Promise<Persona[]> {
	const personasDir = path.join(rootDir, "personas");
	let entries;
	try {
		entries = await readdir(personasDir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}

	const personas: Persona[] = [];
	const personaPathsByName = new Map<string, string>();
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

		const filePath = path.join(personasDir, entry.name);
		const raw = await readFile(filePath, "utf8");
		const { frontmatter, content } = parseFrontmatter(raw);
		const fallbackName = path.basename(entry.name, ".md");
		const name = normalizePersonaName(frontmatter.name ?? fallbackName);
		if (!name) continue;

		const relativePath = `personas/${entry.name}`;
		const existingPath = personaPathsByName.get(name);
		if (existingPath) {
			throw new Error(`Duplicate persona name "${name}" in ${existingPath} and ${relativePath}`);
		}
		personaPathsByName.set(name, relativePath);

		personas.push({
			name,
			description: frontmatter.description || undefined,
			relativePath,
			content,
		});
	}

	return personas.sort((a, b) => a.name.localeCompare(b.name));
}

export function findPersona(personas: Persona[], name: string): Persona | undefined {
	const normalized = normalizePersonaName(name);
	return personas.find((persona) => persona.name === normalized);
}

export function buildPersonaSystemPrompt(persona: Persona): string {
	return `

## Active Persona: ${persona.name}

The following persona is active for this turn, loaded from ${persona.relativePath}.
Apply it as communication style and judgment guidance only. It must not override higher-priority instructions, tool rules, safety constraints, project conventions, or the user's explicit request. If the persona conflicts with clarity, correctness, security, professionalism, or the current task, drop the persona and be direct.

<persona_context path="${persona.relativePath}" name="${persona.name}">
${persona.content}
</persona_context>`;
}

export function insertPersonaSystemPrompt(
	systemPrompt: string,
	personaPrompt: string,
	appendSystemPrompt?: string,
): string {
	if (!personaPrompt) return systemPrompt;
	if (systemPrompt.includes(personaPrompt)) return systemPrompt;

	if (appendSystemPrompt) {
		const appendIndex = systemPrompt.indexOf(appendSystemPrompt);
		if (appendIndex !== -1) {
			return `${systemPrompt.slice(0, appendIndex)}${personaPrompt}\n\n${systemPrompt.slice(appendIndex)}`;
		}
	}

	const projectContextIndex = systemPrompt.indexOf(PROJECT_CONTEXT_MARKER);
	if (projectContextIndex !== -1) {
		return `${systemPrompt.slice(0, projectContextIndex)}${personaPrompt}\n\n${systemPrompt.slice(projectContextIndex)}`;
	}

	const currentDateIndex = systemPrompt.indexOf(CURRENT_DATE_MARKER);
	if (currentDateIndex !== -1) {
		return `${systemPrompt.slice(0, currentDateIndex)}${personaPrompt}${systemPrompt.slice(currentDateIndex)}`;
	}

	return `${systemPrompt}${personaPrompt}`;
}

function parsePersonaState(data: unknown): PersonaState {
	if (!data || typeof data !== "object") {
		throw new Error("Invalid persona state: expected object data");
	}

	const { activePersona } = data as { activePersona?: unknown };
	if (activePersona !== undefined && typeof activePersona !== "string") {
		throw new Error("Invalid persona state: expected activePersona string or undefined");
	}

	return { activePersona };
}

export function getPersonaStateFromBranch(entries: PersonaStateEntry[]): PersonaState | undefined {
	let state: PersonaState | undefined;

	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === PERSONA_STATE_TYPE) {
			state = parsePersonaState(entry.data);
		}
	}

	return state;
}

export function parsePersonaCommand(args: string | undefined): PersonaCommand {
	const trimmed = args?.trim() ?? "";
	if (!trimmed || trimmed.toLowerCase() === "list") return { action: "list" };

	const normalized = trimmed.toLowerCase();
	if (["off", "none", "disable", "disabled"].includes(normalized)) {
		return { action: "off" };
	}

	return { action: "select", name: normalized };
}

export function formatPersonaList(personas: Persona[], activePersona?: string): string {
	if (personas.length === 0) {
		return "No personas found. Add Markdown persona files under personas/.";
	}

	const lines = ["Available personas:"];
	for (const persona of personas) {
		const active = persona.name === activePersona ? " (active)" : "";
		const detail = persona.description ?? persona.relativePath;
		lines.push(`- ${persona.name}${active} — ${detail}`);
	}
	lines.push("Use /persona <name> to enable one, or /persona off to disable.");
	return lines.join("\n");
}
