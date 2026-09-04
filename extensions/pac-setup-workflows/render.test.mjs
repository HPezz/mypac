import test from "node:test";
import assert from "node:assert/strict";
import { analyzeLabels, buildApplyPlan } from "./drift.ts";
import { renderApplyPlan, renderCheckResult, renderHelp } from "./render.ts";

test("renderCheckResult includes required check sections", () => {
	const result = analyzeLabels([
		{ name: "prd", color: "C5DEF5", description: "legacy" },
		{ name: "bug", color: "d73a4a", description: "Something isn't working" },
	]);
	const text = renderCheckResult("ladislas/mypac", result);
	assert.match(text, /# Pac workflow labels — ladislas\/mypac/);
	assert.match(text, /## Missing required pac labels/);
	assert.match(text, /## Legacy migration candidates/);
	assert.match(text, /`prd` → `pac:prd`/);
	assert.match(text, /## Host-owned labels noticed but not managed/);
	assert.match(text, /`bug`/);
});

test("renderApplyPlan shows renames and creates", () => {
	const plan = buildApplyPlan(analyzeLabels([{ name: "prd", color: "C5DEF5", description: "legacy" }]));
	const text = renderApplyPlan("ladislas/mypac", plan);
	assert.match(text, /## Renames/);
	assert.match(text, /`prd` → `pac:prd`/);
	assert.match(text, /## Creates/);
	assert.doesNotMatch(text, /- `pac:prd` #/);
});

test("rendering exposes inherited labels and ownership conflicts before apply", () => {
	const result = analyzeLabels([
		{ id: 1, name: "pac:prd", color: "#000000", description: "project", scope: "project" },
		{ id: 2, name: "pac:prd", color: "#BFDADC", description: "group", scope: "group" },
	]);
	const check = renderCheckResult("git.example.com/group/app", result);
	const plan = renderApplyPlan("git.example.com/group/app", buildApplyPlan(result));

	assert.match(check, /Inherited GitLab group labels \(read-only\)/);
	assert.match(check, /exists at both project and group scope/);
	assert.match(plan, /Inherited\/project conflicts not auto-resolved/);
	assert.match(plan, /will not overwrite either label/);
});

test("renderHelp documents supported command forms", () => {
	const text = renderHelp();
	assert.match(text, /\/pac-setup-workflows labels check --repo owner\/repo/);
	assert.match(text, /gitlab\.example\/group\/project/);
	assert.match(text, /Apply mode requires explicit confirmation/);
});
