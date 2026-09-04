import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skill = await readFile(new URL("./SKILL.md", import.meta.url), "utf8");

test("grilling publishes durable artifacts only to resolved forge issues", () => {
	assert.match(skill, /Issues on the resolved GitHub or GitLab forge/i);
	assert.match(skill, /Pull request and merge request discussions never receive PRD or ADR artifacts/i);
	assert.match(skill, /resolve a linked issue.*ask the user.*without creating one automatically/i);
	assert.match(skill, /gh issue comment.*glab issue note create/i);
});

test("every remote write preserves freshness, confirmation, and missing-label safety", () => {
	assert.match(skill, /latest issue body, comments, and labels immediately before mutation/i);
	assert.match(skill, /exact remote write set.*explicit user confirmation/i);
	assert.match(skill, /Missing artifact labels are non-blocking/i);
	assert.match(skill, /\/pac-setup-workflows/);
	assert.match(skill, /Never fall back across providers/i);
});
