import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [skill, template] = await Promise.all([
	readFile(new URL("./SKILL.md", import.meta.url), "utf8"),
	readFile(new URL("./CHECKPOINT_ISSUE_TEMPLATE.md", import.meta.url), "utf8"),
]);

test("checkpoint comparison stays host-neutral while destination follows the current forge", () => {
	assert.match(skill, /explicit repository context.*tracking remote.*origin/i);
	assert.match(skill, /GitHub, GitLab, or other hosts.*host-neutral checkout cache/i);
	assert.match(skill, /exactly one checkpoint issue on the current forge/i);
	assert.match(skill, /partial failures/i);
	assert.match(skill, /issue URL returned by either provider verbatim/i);
});

test("checkpoint publication handles labels and issue URLs safely on either provider", () => {
	assert.match(template, /matching inherited GitLab group label satisfies/i);
	assert.match(template, /never mutated/i);
	assert.match(template, /explicit setup approval/i);
	assert.match(template, /gh label create.*glab label create/i);
	assert.match(template, /publish without the label/i);
	assert.match(template, /gh issue create.*glab issue create/i);
	assert.match(template, /exact issue URL returned by `gh` or `glab`/i);
});
