import assert from "node:assert/strict";
import test from "node:test";

import { REQUIRED_PAC_LABELS } from "../extensions/pac-setup-workflows/config.ts";
import {
	MANAGED_COMMENT_MARKER,
	analyzeIssueLabelHealth,
	reconcileManagedComment,
	renderWarningComment,
} from "./pac-label-health.ts";

const repositoryLabels = REQUIRED_PAC_LABELS.map((label) => ({ ...label }));

function analyze(issueLabels, labels = repositoryLabels) {
	return analyzeIssueLabelHealth({ issueLabels, repositoryLabels: labels });
}

test("analyzeIssueLabelHealth accepts one state and one execution label", () => {
	const result = analyze(["pac:ready_for_agent", "pac:afk", "pac:prd"]);

	assert.deepEqual(result.problems, []);
});

test("analyzeIssueLabelHealth detects conflicting state labels", () => {
	const result = analyze(["pac:needs_triage", "pac:ready_for_agent"]);

	assert.equal(result.problems[0].kind, "conflicting-state");
	assert.match(result.problems[0].message, /pac:needs_triage/);
	assert.match(result.problems[0].message, /pac:ready_for_agent/);
});

test("analyzeIssueLabelHealth detects conflicting execution labels", () => {
	const result = analyze(["pac:hitl", "pac:afk"]);

	assert.equal(result.problems[0].kind, "conflicting-execution");
});

test("analyzeIssueLabelHealth detects legacy labels", () => {
	const result = analyze(["needs triage", "prd"]);

	assert.deepEqual(
		result.problems.filter((problem) => problem.kind === "legacy-label").map((problem) => problem.message),
		[
			"Legacy label `needs triage` is present. Replace it with `pac:needs_triage`.",
			"Legacy label `prd` is present. Replace it with `pac:prd`.",
		],
	);
});

test("analyzeIssueLabelHealth detects required label setup drift", () => {
	const labels = repositoryLabels.map((label) =>
		label.name === "pac:prd" ? { ...label, color: "C5DEF5", description: "old description" } : label,
	);
	const result = analyze(["pac:prd"], labels);

	assert.equal(result.problems.length, 1);
	assert.equal(result.problems[0].kind, "drifted-required-label");
	assert.match(result.problems[0].message, /pac:prd/);
	assert.match(result.problems[0].message, /color #C5DEF5 should be #BFDADC/);
});

test("analyzeIssueLabelHealth detects missing required labels", () => {
	const labels = repositoryLabels.filter((label) => label.name !== "pac:afk");
	const result = analyze([], labels);

	assert.equal(result.problems.length, 1);
	assert.equal(result.problems[0].kind, "missing-required-label");
	assert.match(result.problems[0].message, /pac:afk/);
});

test("renderWarningComment includes the managed marker and problem list", () => {
	const body = renderWarningComment({
		problems: [{ kind: "legacy-label", message: "Legacy label `prd` is present." }],
	});

	assert.match(body, new RegExp(MANAGED_COMMENT_MARKER));
	assert.match(body, /Pac label-health warning/);
	assert.match(body, /Legacy label `prd` is present\./);
});

test("reconcileManagedComment creates a managed comment when problems exist", async () => {
	const calls = [];
	const action = await reconcileManagedComment({
		issueNumber: 203,
		result: { problems: [{ kind: "conflicting-execution", message: "bad labels" }] },
		client: {
			async fetchComments() {
				return [];
			},
			async createComment(issueNumber, body) {
				calls.push(["create", issueNumber, body]);
			},
			async updateComment() {
				throw new Error("unexpected update");
			},
			async deleteComment() {
				throw new Error("unexpected delete");
			},
		},
	});

	assert.equal(action, "created");
	assert.equal(calls[0][0], "create");
	assert.equal(calls[0][1], 203);
	assert.match(calls[0][2], /bad labels/);
});

test("reconcileManagedComment deletes a managed comment when problems are fixed", async () => {
	const calls = [];
	const action = await reconcileManagedComment({
		issueNumber: 203,
		result: { problems: [] },
		client: {
			async fetchComments() {
				return [{ id: 1, body: `${MANAGED_COMMENT_MARKER}\nold warning` }];
			},
			async createComment() {
				throw new Error("unexpected create");
			},
			async updateComment() {
				throw new Error("unexpected update");
			},
			async deleteComment(commentId) {
				calls.push(["delete", commentId]);
			},
		},
	});

	assert.equal(action, "deleted");
	assert.deepEqual(calls, [["delete", 1]]);
});
