import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, type Zippable } from "fflate";
import YAML from "yaml";

const PORTABLE_FIELDS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
const SOURCE_FIELDS = new Set([...PORTABLE_FIELDS, "disable-model-invocation"]);
const SUPPORT_DIRECTORIES = ["assets", "references", "scripts"];
const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0);
const FILE_OPTIONS = { attrs: 0o100644 << 16, mtime: FIXED_MTIME, os: 3 } as const;

export interface ExportOptions {
	repository?: string;
	manifest?: string;
	output?: string;
}

interface Frontmatter {
	name: string;
	description: string;
	license?: string;
	compatibility?: string;
	metadata?: Record<string, string>;
	"allowed-tools"?: string;
	"disable-model-invocation"?: boolean;
	[key: string]: unknown;
}

interface SkillManifest {
	skills: string[];
}

function fail(skill: string, message: string): never {
	throw new Error(`${skill}: ${message}`);
}

function inside(path: string, directory: string): boolean {
	const pathFromDirectory = relative(directory, path);
	return pathFromDirectory === "" || (!pathFromDirectory.startsWith(`..${sep}`) && pathFromDirectory !== ".." && !isAbsolute(pathFromDirectory));
}

function parseFrontmatter(skill: string, source: string, allowedFields: Set<string>): Frontmatter {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) fail(skill, "SKILL.md must start with YAML frontmatter");

	const parsed = YAML.parse(match[1]);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(skill, "frontmatter must be a mapping");
	for (const field of Object.keys(parsed)) {
		if (!allowedFields.has(field)) fail(skill, `unsupported frontmatter field: ${field}`);
	}
	if (typeof parsed.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed.name) || parsed.name.length > 64) {
		fail(skill, "name must satisfy Agent Skills naming rules");
	}
	if (parsed.name !== skill) fail(skill, `frontmatter name must match directory name (${parsed.name})`);
	if (typeof parsed.description !== "string" || parsed.description.length === 0 || parsed.description.length > 1024) {
		fail(skill, "description must be a non-empty string of at most 1024 characters");
	}
	for (const field of ["license", "allowed-tools"] as const) {
		if (parsed[field] !== undefined && typeof parsed[field] !== "string") fail(skill, `${field} must be a string`);
	}
	if (parsed.compatibility !== undefined && (typeof parsed.compatibility !== "string" || parsed.compatibility.length === 0 || parsed.compatibility.length > 500)) {
		fail(skill, "compatibility must be a non-empty string of at most 500 characters");
	}
	if (parsed.metadata !== undefined) {
		if (!parsed.metadata || typeof parsed.metadata !== "object" || Array.isArray(parsed.metadata)) fail(skill, "metadata must be a mapping");
		for (const [key, value] of Object.entries(parsed.metadata)) {
			if (typeof key !== "string" || typeof value !== "string") fail(skill, "metadata keys and values must be strings");
		}
	}
	if (parsed["disable-model-invocation"] !== undefined && parsed["disable-model-invocation"] !== true) {
		fail(skill, "disable-model-invocation may only be projected when its value is true");
	}
	return parsed as Frontmatter;
}

function portableSource(skill: string, source: string): string {
	const frontmatter = parseFrontmatter(skill, source, SOURCE_FIELDS);
	if (frontmatter.compatibility?.toLowerCase().includes("pi coding agent")) {
		fail(skill, "compatibility declares a Pi-only runtime");
	}

	const runtimeMarkers: Array<[RegExp, string]> = [
		[/~\/\.pi\b|(?:^|[\s`"'(])\.pi\//m, "Pi filesystem path"],
		[/(?:^|[\s`"'(])(?:skills|prompts)\//m, "repository-external skill or prompt path"],
		[/\/pac-[a-z0-9-]+/i, "Pi slash-command reference"],
		[/\bCONTEXT\.md\b/, "Pi project-context convention"],
		[/\bgh\s+(?:api|issue|pr|repo|label|workflow|run)\b/i, "gh CLI instruction"],
		[/\bPi (?:coding agent|runtime)\b/i, "Pi runtime reference"],
	];
	for (const [pattern, description] of runtimeMarkers) {
		if (pattern.test(source)) fail(skill, `contains ${description}`);
	}

	if (frontmatter["disable-model-invocation"] !== true) return source;
	const projected = source.replace(/^disable-model-invocation:\s*true\s*\r?\n/m, "");
	if (projected === source) fail(skill, "could not project disable-model-invocation safely");
	parseFrontmatter(skill, projected, PORTABLE_FIELDS);
	return projected;
}

async function regularFiles(skill: string, directory: string, prefix = ""): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		const absolutePath = join(directory, entry.name);
		if (entry.isSymbolicLink()) fail(skill, `symlinks are not portable: ${relativePath}`);
		if (entry.isDirectory()) files.push(...(await regularFiles(skill, absolutePath, relativePath)));
		else if (entry.isFile()) files.push(relativePath);
		else fail(skill, `unsupported filesystem entry: ${relativePath}`);
	}
	return files;
}

function localReferences(source: string): string[] {
	const references = new Set<string>();
	for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) references.add(match[1]);
	for (const match of source.matchAll(/`((?:assets|references|scripts)\/[^`\s]+)`/g)) references.add(match[1]);
	return [...references];
}

function validateReferences(skill: string, source: string, skillDirectory: string, packagedFiles: Set<string>): void {
	for (const rawReference of localReferences(source)) {
		if (/^(?:https?:|mailto:|#)/i.test(rawReference)) continue;
		const reference = decodeURIComponent(rawReference.split(/[?#]/, 1)[0]);
		if (isAbsolute(reference)) fail(skill, `absolute reference is not portable: ${rawReference}`);
		const resolved = resolve(skillDirectory, reference);
		if (!inside(resolved, skillDirectory)) fail(skill, `reference escapes the skill package: ${rawReference}`);
		const normalized = relative(skillDirectory, resolved).split(sep).join("/");
		if (!packagedFiles.has(normalized)) fail(skill, `referenced resource is not packaged: ${rawReference}`);
	}
}

async function loadManifest(path: string): Promise<SkillManifest> {
	const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).some((key) => key !== "skills")) {
		throw new Error("chatgpt-skills.json must contain only a skills array");
	}
	const skills = (parsed as { skills?: unknown }).skills;
	if (!Array.isArray(skills) || skills.length === 0 || skills.some((skill) => typeof skill !== "string")) {
		throw new Error("chatgpt-skills.json skills must be a non-empty string array");
	}
	if (new Set(skills).size !== skills.length) throw new Error("chatgpt-skills.json contains duplicate skills");
	return { skills } as SkillManifest;
}

export async function exportChatgptSkills(options: ExportOptions = {}): Promise<string[]> {
	const repository = resolve(options.repository ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
	const manifestPath = resolve(options.manifest ?? join(repository, "chatgpt-skills.json"));
	const output = resolve(options.output ?? join(repository, "dist", "chatgpt-skills"));
	const { skills: declaredSkills } = await loadManifest(manifestPath);
	const skills = [...declaredSkills].sort();
	const prepared = new Map<string, Map<string, Uint8Array>>();

	for (const skill of skills) {
		const skillDirectory = resolve(repository, "skills", skill);
		if (!inside(skillDirectory, resolve(repository, "skills"))) fail(skill, "manifest name escapes the skills directory");
		if ((await lstat(skillDirectory)).isSymbolicLink()) fail(skill, "skill directory must not be a symlink");
		const skillFile = join(skillDirectory, "SKILL.md");
		if ((await lstat(skillFile)).isSymbolicLink()) fail(skill, "SKILL.md must not be a symlink");
		const source = portableSource(skill, await readFile(skillFile, "utf8"));
		const packagedFiles = new Map<string, Uint8Array>();
		packagedFiles.set("SKILL.md", Buffer.from(source));

		for (const supportDirectory of SUPPORT_DIRECTORIES) {
			const absoluteDirectory = join(skillDirectory, supportDirectory);
			try {
				if ((await lstat(absoluteDirectory)).isSymbolicLink()) fail(skill, `symlinks are not portable: ${supportDirectory}`);
				for (const file of await regularFiles(skill, absoluteDirectory, supportDirectory)) {
					packagedFiles.set(file, await readFile(join(skillDirectory, file)));
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		validateReferences(skill, source, skillDirectory, new Set(packagedFiles.keys()));
		prepared.set(skill, packagedFiles);
	}

	await rm(output, { recursive: true, force: true });
	await mkdir(join(output, "packages"), { recursive: true });
	for (const [skill, packagedFiles] of prepared) {
		const sortedFiles = [...packagedFiles.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
		const stageDirectory = join(output, skill);
		for (const [path, bytes] of sortedFiles) {
			const target = join(stageDirectory, path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, bytes, { mode: 0o644 });
		}

		const archiveEntries: Zippable = {};
		for (const [path, bytes] of sortedFiles) archiveEntries[path] = [bytes, FILE_OPTIONS];
		await writeFile(join(output, "packages", `${skill}.zip`), zipSync(archiveEntries, { level: 9 }));
	}
	return skills;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
	exportChatgptSkills()
		.then((skills) => process.stdout.write(`Exported ${skills.length} ChatGPT skills: ${skills.join(", ")}\n`))
		.catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		});
}
