import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skill = await readFile(new URL("./SKILL.md", import.meta.url), "utf8");

test("issue graphs support both providers and no-parent plans", () => {
	assert.match(skill, /conversation context, a local PRD draft.*GitHub issue\/PR or GitLab issue\/MR/i);
	assert.match(skill, /gh issue create/);
	assert.match(skill, /glab issue create/);
	assert.match(skill, /may have no parent; do not invent one/i);
	assert.match(skill, /create blockers first/i);
	assert.match(skill, /real created blocker issue URL/i);
});

test("Markdown relationships survive optional native enrichment failures", () => {
	assert.match(skill, /issue bodies are the authoritative portable graph/i);
	assert.match(skill, /addSubIssue.*addBlockedBy/i);
	assert.match(skill, /GitLab.*issue-link APIs.*work-item parent\/child API/i);
	assert.match(skill, /non-blocking enrichment/i);
	assert.match(skill, /unsupported or failed relationship/i);
	assert.match(skill, /Do not discard created issues/i);
});

test("labels and parent updates preserve safe degradation", () => {
	assert.match(skill, /Missing labels are non-blocking/i);
	assert.match(skill, /\/pac-setup-workflows/);
	assert.match(skill, /Re-read its latest body immediately before mutation/i);
	assert.match(skill, /require explicit confirmation/i);
	assert.match(skill, /With no parent, skip this step/i);
});
