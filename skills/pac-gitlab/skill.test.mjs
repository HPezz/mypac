import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skill = await readFile(new URL("./SKILL.md", import.meta.url), "utf8");

test("GitLab guidance covers structured reads for hosted and self-hosted targets", () => {
	assert.match(skill, /explicit issue.*repository URL[\s\S]*tracking remote[\s\S]*origin/i);
	assert.match(skill, /glab auth status --hostname/);
	assert.match(skill, /optional-subgroups/);
	assert.match(skill, /glab issue view.*--output json/);
	assert.match(skill, /glab mr view.*--output json/);
	assert.match(skill, /merge_requests.*discussions.*--paginate/);
	assert.match(skill, /Do not re-fetch fields already returned/i);
});

test("GitLab guidance preserves provider-native language and safe failure behavior", () => {
	assert.match(skill, /merge request \(MR\)/i);
	assert.match(skill, /do not call.*pull request/i);
	assert.match(skill, /read the latest remote state/i);
	assert.match(skill, /Never retry.*through `gh`/i);
});
