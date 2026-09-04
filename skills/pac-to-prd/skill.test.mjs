import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skill = await readFile(new URL("./SKILL.md", import.meta.url), "utf8");

test("draft-only PRDs remain local and forge-independent", () => {
	assert.match(skill, /Default to `draft-only`/);
	assert.match(skill, /~\/\.pi\/agent\/prds/);
	assert.match(skill, /local draft path.*source of truth/i);
});

test("PRD publication targets issues on either forge with safe mutations", () => {
	assert.match(skill, /PRs and MRs.*never PRD publication destinations/i);
	assert.match(skill, /linked issue/i);
	assert.match(skill, /Do not create a target issue automatically/i);
	assert.match(skill, /gh issue comment.*gh issue edit.*glab issue note create.*glab issue update/i);
	assert.match(skill, /new.*PRD iteration comment each run/i);
	assert.match(skill, /read the latest issue body, comments, and labels/i);
	assert.match(skill, /exact write set.*explicit final confirmation/i);
	assert.match(skill, /Missing labels remain non-blocking/i);
	assert.match(skill, /\/pac-setup-workflows/);
});
