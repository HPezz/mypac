import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skill = await readFile(new URL("./SKILL.md", import.meta.url), "utf8");

test("issue creation preserves one structured workflow across both providers", () => {
	assert.match(skill, /## Summary[\s\S]*## Motivation[\s\S]*## Acceptance Criteria/);
	assert.match(skill, /at most one pac workflow state label/i);
	assert.match(skill, /gh issue create/);
	assert.match(skill, /glab issue create/);
	assert.match(skill, /description-file/);
	assert.match(skill, /self-hosted GitLab/i);
	assert.match(skill, /nested namespaces/i);
	assert.match(skill, /Run \/pac-setup-workflows/);
	assert.match(skill, /Return the created issue URL/i);
});

test("issue creation never guesses or falls back across providers", () => {
	assert.match(skill, /resolved host and project/i);
	assert.match(skill, /Do not resolve a different destination/i);
	assert.match(skill, /fall back from one provider to the other/i);
	assert.match(skill, /\/ghi.*compatibility alias/i);
});
