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
