import test from "node:test";
import assert from "node:assert/strict";
import { REQUIRED_PAC_LABELS } from "./config.ts";
import { analyzeLabels, buildApplyPlan, normalizeColor } from "./drift.ts";

const label = (name, color = "000000", description = "") => ({ name, color, description });
const required = (name) => REQUIRED_PAC_LABELS.find((item) => item.name === name);

test("normalizeColor strips leading hash and uppercases", () => {
	assert.equal(normalizeColor("#bfDadc"), "BFDADC");
});

test("required pac labels include upstream checkpoint artifacts", () => {
	const checkpoint = required("pac:upstream-checkpoint");
	assert.ok(checkpoint);
	assert.equal(checkpoint.color, "C2E0C6");
	assert.equal(checkpoint.description, "pac artifact: upstream inspiration review checkpoint");
});

test("analyzeLabels reports all required pac labels as missing when none exist", () => {
	const result = analyzeLabels([label("bug"), label("enhancement")]);
	assert.equal(result.missing.length, REQUIRED_PAC_LABELS.length);
	assert.deepEqual(
		result.hostOwned.map((item) => item.name).sort(),
		["bug", "enhancement"],
	);
});

test("analyzeLabels detects metadata drift for existing pac labels", () => {
	const result = analyzeLabels([label("pac:prd", "c5def5", "old description")]);
	const drift = result.drifted.find((item) => item.expected.name === "pac:prd");
	assert.ok(drift);
	assert.deepEqual(drift.fields.color, { actual: "C5DEF5", expected: "BFDADC" });
	assert.deepEqual(drift.fields.description, {
		actual: "old description",
		expected: "pac artifact: issue contains a PRD artifact or was created from a PRD",
	});
});

test("analyzeLabels reports legacy migration candidates when target pac label is absent", () => {
	const result = analyzeLabels([label("prd", "C5DEF5", "legacy prd")]);
	assert.equal(result.migrationCandidates.length, 1);
	assert.equal(result.migrationCandidates[0].mapping.legacy, "prd");
	assert.equal(result.migrationCandidates[0].mapping.target, "pac:prd");
	assert.equal(result.conflicts.length, 0);
});

test("analyzeLabels reports previous role labels as migration candidates", () => {
	const result = analyzeLabels([
		label("needs-info", "F9D0C4", "legacy needs info"),
		label("ready-for-agent", "0E8A16", "legacy ready for agent"),
		label("ready-for-human", "1D76DB", "legacy ready for human"),
	]);
	assert.deepEqual(
		result.migrationCandidates.map((candidate) => [candidate.mapping.legacy, candidate.mapping.target]),
		[
			["needs-info", "pac:needs_info"],
			["ready-for-agent", "pac:ready_for_agent"],
			["ready-for-human", "pac:ready_for_human"],
		],
	);
});

test("analyzeLabels reports conflicts when both legacy and target labels exist", () => {
	const expected = required("pac:prd");
	const result = analyzeLabels([
		label("prd", "C5DEF5", "legacy prd"),
		label("pac:prd", expected.color, expected.description),
	]);
	assert.equal(result.migrationCandidates.length, 0);
	assert.equal(result.conflicts.length, 1);
	assert.equal(result.conflicts[0].mapping.legacy, "prd");
});

test("buildApplyPlan renames legacy labels instead of also creating their targets", () => {
	const result = analyzeLabels([label("prd", "C5DEF5", "legacy prd")]);
	const plan = buildApplyPlan(result);
	assert.deepEqual(
		plan.renames.map((item) => item.mapping.target),
		["pac:prd"],
	);
	assert.equal(plan.creates.some((item) => item.name === "pac:prd"), false);
});

test("inherited GitLab labels satisfy requirements without project mutations", () => {
	const expected = required("pac:prd");
	const result = analyzeLabels([
		{ ...label("pac:prd", "000000", "group-owned metadata"), id: 10, scope: "group" },
	]);
	const plan = buildApplyPlan(result);

	assert.equal(result.missing.some((item) => item.name === "pac:prd"), false);
	assert.equal(result.drifted.some((item) => item.expected.name === "pac:prd"), false);
	assert.equal(plan.creates.some((item) => item.name === "pac:prd"), false);
	assert.equal(plan.updates.some((item) => item.expected.name === "pac:prd"), false);
	assert.deepEqual(result.inherited.map((item) => item.name), ["pac:prd"]);
	assert.ok(expected);
});

test("project and inherited label conflicts are reported and skipped", () => {
	const expected = required("pac:prd");
	const result = analyzeLabels([
		{ ...label("pac:prd", "000000", "project drift"), id: 11, scope: "project" },
		{ ...label("pac:prd", expected.color, expected.description), id: 12, scope: "group" },
	]);
	const plan = buildApplyPlan(result);

	assert.equal(result.ownershipConflicts.length, 1);
	assert.equal(result.ownershipConflicts[0].projectLabel.id, 11);
	assert.equal(result.ownershipConflicts[0].inheritedLabel.id, 12);
	assert.equal(plan.updates.some((item) => item.expected.name === "pac:prd"), false);
});

test("inherited legacy labels are never selected for rename", () => {
	const result = analyzeLabels([{ ...label("prd", "C5DEF5", "group legacy"), id: 13, scope: "group" }]);
	const plan = buildApplyPlan(result);

	assert.equal(plan.renames.length, 0);
	assert.equal(plan.creates.some((item) => item.name === "pac:prd"), true);
});

test("unexpected pac labels are noticed but not managed", () => {
	const result = analyzeLabels([label("pac:custom_state", "123456", "custom")]);
	assert.deepEqual(result.unexpectedPacLabels.map((item) => item.name), ["pac:custom_state"]);
});
