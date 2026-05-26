import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildPersonaSystemPrompt,
	formatPersonaList,
	getPersonaStateFromBranch,
	insertPersonaSystemPrompt,
	loadPersonas,
	parsePersonaCommand,
} from "./helpers.ts";

async function makeTempDir(t, prefix) {
	const dir = await mkdtemp(path.join(tmpdir(), prefix));
	t.after(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

test("loadPersonas reads root markdown persona files and strips frontmatter", async (t) => {
	const cwd = await makeTempDir(t, "personas-");
	await mkdir(path.join(cwd, "personas"));
	await writeFile(
		path.join(cwd, "personas", "rick.md"),
		`---\nname: rick\ndescription: Chaotic genius\n---\n\n# Rick\n\nBe useful.\n`,
		"utf8",
	);
	await writeFile(path.join(cwd, "personas", "notes.txt"), "ignore", "utf8");

	const personas = await loadPersonas(cwd);

	assert.equal(personas.length, 1);
	assert.equal(personas[0].name, "rick");
	assert.equal(personas[0].description, "Chaotic genius");
	assert.equal(personas[0].content, "# Rick\n\nBe useful.");
	assert.equal(personas[0].relativePath, "personas/rick.md");
});

test("loadPersonas returns an empty list when no personas directory exists", async (t) => {
	const cwd = await makeTempDir(t, "personas-missing-");
	assert.deepEqual(await loadPersonas(cwd), []);
});

test("loadPersonas tolerates CRLF frontmatter", async (t) => {
	const cwd = await makeTempDir(t, "personas-crlf-");
	await mkdir(path.join(cwd, "personas"));
	await writeFile(
		path.join(cwd, "personas", "rick.md"),
		"---\r\nname: rick\r\ndescription: Chaotic genius\r\n---\r\n\r\n# Rick\r\n\r\nBe useful.\r\n",
		"utf8",
	);

	const personas = await loadPersonas(cwd);

	assert.equal(personas[0].name, "rick");
	assert.equal(personas[0].description, "Chaotic genius");
	assert.equal(personas[0].content, "# Rick\r\n\r\nBe useful.");
});

test("loadPersonas tolerates leading whitespace and BOM before frontmatter", async (t) => {
	const cwd = await makeTempDir(t, "personas-leading-");
	await mkdir(path.join(cwd, "personas"));
	await writeFile(
		path.join(cwd, "personas", "rick.md"),
		"\uFEFF  \n---\nname: rick\ndescription: Chaotic genius\n---\n\n# Rick\n\nBe useful.\n",
		"utf8",
	);

	const personas = await loadPersonas(cwd);

	assert.equal(personas[0].name, "rick");
	assert.equal(personas[0].description, "Chaotic genius");
	assert.equal(personas[0].content, "# Rick\n\nBe useful.");
});

test("loadPersonas treats unclosed frontmatter as content", async (t) => {
	const cwd = await makeTempDir(t, "personas-unclosed-");
	await mkdir(path.join(cwd, "personas"));
	await writeFile(path.join(cwd, "personas", "rick.md"), "---\nname: rick\n# Rick\n", "utf8");

	const personas = await loadPersonas(cwd);

	assert.equal(personas[0].name, "rick");
	assert.equal(personas[0].description, undefined);
	assert.equal(personas[0].content, "---\nname: rick\n# Rick");
});

test("loadPersonas rejects duplicate normalized persona names", async (t) => {
	const cwd = await makeTempDir(t, "personas-duplicates-");
	await mkdir(path.join(cwd, "personas"));
	await writeFile(path.join(cwd, "personas", "rick.md"), "# Rick\n", "utf8");
	await writeFile(path.join(cwd, "personas", "duplicate.md"), "---\nname: Rick\n---\n\n# Duplicate\n", "utf8");

	await assert.rejects(
		loadPersonas(cwd),
		/Duplicate persona name "rick" in personas\/duplicate\.md and personas\/rick\.md/,
	);
});

test("buildPersonaSystemPrompt wraps persona content with precedence guardrails", () => {
	const prompt = buildPersonaSystemPrompt({
		name: "rick",
		description: "Chaotic genius",
		relativePath: "personas/rick.md",
		content: "# Persona\n\nBe sharp.",
	});

	assert.match(prompt, /## Active Persona: rick/);
	assert.match(prompt, /personas\/rick\.md/);
	assert.match(prompt, /must not override higher-priority instructions/);
	assert.match(prompt, /# Persona\n\nBe sharp\./);
});

test("insertPersonaSystemPrompt inserts before append-system prompt", () => {
	const append = "Append instructions";
	const block = "\n\n## Active Persona: rick\n\nPersona text";
	const result = insertPersonaSystemPrompt(`Pi base\n\n${append}\n\n<project_context>`, block, append);

	assert.ok(result.indexOf("Pi base") < result.indexOf("## Active Persona"));
	assert.ok(result.indexOf("## Active Persona") < result.indexOf(append));
});

test("insertPersonaSystemPrompt inserts before project context when append prompt is absent", () => {
	const block = "\n\n## Active Persona: rick\n\nPersona text";
	const result = insertPersonaSystemPrompt("Pi base\n\n<project_context>", block);

	assert.ok(result.indexOf("## Active Persona") < result.indexOf("<project_context>"));
});

test("insertPersonaSystemPrompt inserts before current date when no earlier marker exists", () => {
	const block = "\n\n## Active Persona: rick\n\nPersona text";
	const result = insertPersonaSystemPrompt("Pi base\nCurrent date: 2026-05-25", block);

	assert.match(result, /Persona text\nCurrent date:/);
});

test("insertPersonaSystemPrompt does not match inline current date text", () => {
	const block = "\n\n## Active Persona: rick\n\nPersona text";
	const result = insertPersonaSystemPrompt("Pi base mentions Current date: as text", block);

	assert.equal(result, "Pi base mentions Current date: as text\n\n## Active Persona: rick\n\nPersona text");
});

test("insertPersonaSystemPrompt is idempotent", () => {
	const block = "\n\n## Active Persona: rick\n\nPersona text";
	const prompt = `Pi base${block}\n\nCurrent date: 2026-05-25`;

	assert.equal(insertPersonaSystemPrompt(prompt, block), prompt);
});

test("getPersonaStateFromBranch returns the latest valid persona state", () => {
	const state = getPersonaStateFromBranch([
		{ type: "custom", customType: "persona-state", data: { activePersona: "rick" } },
		{ type: "custom", customType: "persona-state", data: { activePersona: undefined } },
	]);

	assert.deepEqual(state, { activePersona: undefined });
});

test("parsePersonaCommand recognizes list, off, and persona selections", () => {
	assert.deepEqual(parsePersonaCommand(undefined), { action: "list" });
	assert.deepEqual(parsePersonaCommand("   "), { action: "list" });
	assert.deepEqual(parsePersonaCommand("list"), { action: "list" });
	assert.deepEqual(parsePersonaCommand("off"), { action: "off" });
	assert.deepEqual(parsePersonaCommand("disable"), { action: "off" });
	assert.deepEqual(parsePersonaCommand("Rick"), { action: "select", name: "rick" });
});

test("formatPersonaList marks active persona", () => {
	const output = formatPersonaList(
		[
			{ name: "default", relativePath: "personas/default.md", content: "Default" },
			{ name: "rick", description: "Chaotic genius", relativePath: "personas/rick.md", content: "Rick" },
		],
		"rick",
	);

	assert.match(output, /Available personas:/);
	assert.match(output, /- default — personas\/default\.md/);
	assert.match(output, /- rick \(active\) — Chaotic genius/);
});
