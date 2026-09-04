import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skillPath = new URL("./SKILL.md", import.meta.url);

async function readSkill() {
	return readFile(skillPath, "utf8");
}

test("triage gathers context progressively from the requested action", async () => {
	const skill = await readSkill();
	const resolveAction = skill.search(/resolve the requested action/i);
	const metadataFirst = skill.search(/issue metadata and body first/i);
	const evidenceGate = skill.search(/enough evidence to perform or recommend the pending action/i);
	const targetedExpansion = skill.search(/expand only for a specific unresolved question/i);

	assert.ok(resolveAction >= 0, "triage should resolve the requested action first");
	assert.ok(metadataFirst > resolveAction, "issue metadata/body should follow action resolution");
	assert.ok(evidenceGate > metadataFirst, "the sufficiency gate should follow the initial issue read");
	assert.ok(targetedExpansion > evidenceGate, "optional evidence should follow the sufficiency gate");
	assert.match(skill, /do not re-fetch.*fields already returned/i);
	assert.match(skill, /before each additional read.*materially missing fact/i);
});

test("cheap triage paths do not mandate deep context", async () => {
	const skill = await readSkill();

	assert.match(skill, /listing.*metadata.*labels.*state.*age.*body summary/is);
	assert.match(skill, /simple state override.*current labels.*requested target state/is);
	assert.match(skill, /do not.*comments.*linked artifacts.*source.*out-of-scope precedent/is);
	assert.match(skill, /unless.*pending transition.*requires/i);
});

test("deep triage branches retain their required evidence", async () => {
	const skill = await readSkill();

	assert.match(skill, /needs[_-]info.*prior triage notes.*reporter answers/is);
	assert.match(skill, /ready-for-agent.*bug.*focused reproduction.*relevant code evidence/is);
	assert.match(skill, /PRD.*ADR.*follow only.*needed.*pending question.*authoritative/is);
	assert.match(skill, /out-of-scope.*precedent.*only when.*scope-boundary/is);
	assert.match(skill, /maintainer approval.*explicit state-change request/is);
});

test("triage preserves one state machine across GitHub and GitLab", async () => {
	const skill = await readSkill();

	assert.match(skill, /GitHub or GitLab issues through one durable state machine/i);
	assert.match(skill, /explicit URL first.*tracking remote.*origin.*ask rather than guessing/i);
	assert.match(skill, /`gh` for GitHub and `glab` for GitLab/i);
	assert.match(skill, /Unlabeled.*pac:needs_triage.*pac:needs_info.*reporter activity/is);
	assert.match(skill, /latest reporter activity.*latest AI triage-notes comment/i);
	assert.match(skill, /AI during triage/);
});

test("GitLab inherited labels and provider failures remain safe", async () => {
	const skill = await readSkill();

	assert.match(skill, /inherited GitLab group label satisfies.*read-only/i);
	assert.match(skill, /never add, remove, rename, or edit the group label/i);
	assert.match(skill, /Surface provider failures without an unsafe fallback/i);
	assert.match(skill, /Expected pac workflow label is missing/);
	assert.match(skill, /\/pac-setup-workflows/);
});
