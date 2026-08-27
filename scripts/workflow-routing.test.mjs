import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatSkillsForPrompt, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowOnlySkills = [
	"pac-explore",
	"pac-grill-me",
	"pac-grill-with-docs",
	"pac-to-issues",
	"pac-to-prd",
];

async function readRepoFile(...segments) {
	return readFile(path.join(repoRoot, ...segments), "utf8");
}

test("pac-llat starts with the target and expands context only when classification requires it", async () => {
	const prompt = await readRepoFile("prompts", "pac-llat.md");

	assert.match(prompt, /lightweight assessment router/i);
	assert.match(prompt, /smallest authoritative/i);
	assert.match(prompt, /do not load another workflow skill merely because/i);
	assert.match(prompt, /do not read.*README\.md.*AGENTS\.md.*CONTEXT\.md/i);
	assert.match(prompt, /issue comments/i);
	assert.match(prompt, /additional targeted reads only when.*materially insufficient/i);
	assert.doesNotMatch(prompt, /perform one targeted follow-up read/i);
	assert.match(prompt, /\*\*Provided arguments\*\*: \$@\s*$/);
});

test("pac-lwot gates execution before loading implementation context", async () => {
	const prompt = await readRepoFile("prompts", "pac-lwot.md");
	const targetResolution = prompt.search(/resolve the target/i);
	const executionGate = prompt.search(/execution (?:is|required|necessity)/i);
	const repositoryPreparation = prompt.search(/repository (?:rules|state|context)/i);

	assert.ok(targetResolution >= 0, "target resolution should be explicit");
	assert.ok(executionGate > targetResolution, "execution gate should follow target resolution");
	assert.ok(repositoryPreparation > executionGate, "repository preparation should follow the execution gate");
	assert.match(prompt, /smallest authoritative artifact/i);
	assert.match(prompt, /no (?:work|execution).*stop/i);
	assert.match(prompt, /do not.*README\.md.*(?:startup|by default)/i);
	assert.match(prompt, /repository-specific.*rules.*before mutation/i);
	assert.match(prompt, /implementation skills.*only after.*execution/i);
	assert.match(prompt, /pac-commit.*only when.*commit/i);
});

test("workflow-only skills stay out of model context but explicit prompts still load them", async () => {
	const { skills, diagnostics } = loadSkillsFromDir({
		dir: path.join(repoRoot, "skills"),
		source: "workflow-routing-test",
	});
	assert.deepEqual(diagnostics, []);
	const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
	const modelPrompt = formatSkillsForPrompt(skills);

	for (const name of workflowOnlySkills) {
		assert.equal(skillsByName.get(name)?.disableModelInvocation, true, `${name} should be workflow-only`);
		assert.doesNotMatch(modelPrompt, new RegExp(`<name>${name}</name>`));

		const explicitPrompt = await readRepoFile("prompts", `${name}.md`);
		assert.match(explicitPrompt, new RegExp(`skills/${name}/SKILL\\.md`));
	}
});

test("pac-github remains available for non-trivial GitHub operations without claiming simple reads", async () => {
	const { skills } = loadSkillsFromDir({
		dir: path.join(repoRoot, "skills"),
		source: "workflow-routing-test",
	});
	const github = skills.find((skill) => skill.name === "pac-github");

	assert.ok(github);
	assert.equal(github.disableModelInvocation, false);
	assert.match(github.description, /non-trivial GitHub operations/i);
	assert.doesNotMatch(github.description, /working with GitHub issues, pull requests/i);
});

test("durable docs describe pac-llat routing and model-invocation visibility", async () => {
	const [readme, catalog] = await Promise.all([
		readRepoFile("README.md"),
		readRepoFile("docs", "catalog.md"),
	]);

	assert.match(readme, /pac-llat.*classify a target and route it to the appropriate workflow/i);
	assert.match(catalog, /pac-llat.*classify a target and route it to the appropriate workflow/i);
	assert.match(catalog, /disable-model-invocation/i);
	assert.match(catalog, /workflow-only skills/i);
});

test("shared guidance requires progressive context disclosure", async () => {
	const shared = await readRepoFile("shared", "SHARED_APPEND_SYSTEM.md");

	assert.match(shared, /progressive context disclosure/i);
	assert.match(shared, /smallest authoritative artifact/i);
	assert.match(shared, /materially needed for the next decision/i);
});

test("shared guidance prefers structured GitHub tooling over browser automation", async () => {
	const shared = await readRepoFile("shared", "SHARED_APPEND_SYSTEM.md");

	assert.match(shared, /structured, purpose-built tools over browser automation/i);
	assert.match(shared, /GitHub issues.*pull requests.*comments.*checks/i);
	assert.match(shared, /do not use `agent_browser` merely to read or inspect/i);
	assert.match(shared, /rendered browser or UI behavior/i);
	assert.match(shared, /unavailable through structured tooling/i);
});
