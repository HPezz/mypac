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
const autoInvocableCapabilitySkills = [
	"pac-caveman",
	"pac-changelog",
	"pac-commit",
	"pac-diagnose",
	"pac-github",
	"pac-github-issue-create",
	"pac-handoff",
	"pac-librarian",
	"pac-pi-extension",
	"pac-pi-prompt",
	"pac-pi-skill",
	"pac-review",
	"pac-tdd",
	"pac-uv",
	"pac-zoom-out",
];
const needsEvidenceSkills = [
	"pac-improve-architecture",
	"pac-review-standards-spec",
	"pac-triage",
	"pac-upstream-checkpoints",
];
const modelVisibleSkills = [...autoInvocableCapabilitySkills, ...needsEvidenceSkills];

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

test("the intended model-visible skill set is an explicit metadata contract", () => {
	const { skills, diagnostics } = loadSkillsFromDir({
		dir: path.join(repoRoot, "skills"),
		source: "workflow-routing-test",
	});
	assert.deepEqual(diagnostics, []);

	const discoveredNames = skills.map((skill) => skill.name).sort();
	const classifiedNames = [...workflowOnlySkills, ...modelVisibleSkills].sort();
	assert.deepEqual(discoveredNames, classifiedNames, "all package skills should have an invocation classification");

	const visibleNames = skills
		.filter((skill) => !skill.disableModelInvocation)
		.map((skill) => skill.name)
		.sort();
	assert.deepEqual(visibleNames, modelVisibleSkills.toSorted());

	const modelPrompt = formatSkillsForPrompt(skills);
	for (const name of modelVisibleSkills) {
		assert.match(modelPrompt, new RegExp(`<name>${name}</name>`), `${name} should remain model-visible`);
	}
});

test("pac-improve-architecture advertises architecture work rather than generic exploration", () => {
	const { skills } = loadSkillsFromDir({
		dir: path.join(repoRoot, "skills"),
		source: "workflow-routing-test",
	});
	const architecture = skills.find((skill) => skill.name === "pac-improve-architecture");

	assert.ok(architecture);
	assert.match(architecture.description, /explicitly asks for codebase architecture/i);
	assert.match(architecture.description, /not for general product (?:ideation|exploration)/i);
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

test("pac-pi-extension verifies pinned APIs through progressive documentation reads", async () => {
	const skill = await readRepoFile("skills", "pac-pi-extension", "SKILL.md");
	const inspectExistingCode = skill.search(/inspect the existing extension implementation/i);
	const identifyApiSurface = skill.search(/identify the concrete Pi API.*surface/i);
	const readTargetedDocs = skill.search(/targeted searches.*specific sections.*specific examples/i);

	assert.ok(inspectExistingCode >= 0, "existing extension code inspection should be explicit");
	assert.ok(identifyApiSurface > inspectExistingCode, "API identification should follow local inspection");
	assert.ok(readTargetedDocs > identifyApiSurface, "targeted documentation should follow API identification");
	assert.match(skill, /installed.*pinned.*authoritative/i);
	assert.match(skill, /matching line numbers.*narrow surrounding range/i);
	assert.match(skill, /do not begin.*entire documentation file/i);
	assert.match(skill, /sequential ranges.*whole-document read/i);
	assert.match(skill, /before.*whole-file fallback.*state.*unresolved API question.*targeted evidence.*failed/i);
	assert.match(skill, /established local.*TUI.*pattern.*does not.*broad TUI documentation/i);
	assert.match(skill, /TUI documentation only when.*touches TUI behavior/i);
	assert.match(skill, /expand.*broader documentation only when.*targeted.*insufficient/i);
	assert.match(skill, /do not rely on memory/i);
	assert.match(skill, /upstream `pi-mono`.*only.*upgrade/i);
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
