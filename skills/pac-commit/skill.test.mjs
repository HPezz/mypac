import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("./SKILL.md", import.meta.url);
const fixupUrl = new URL("./FIXUP.md", import.meta.url);

async function readSkill(url) {
	return readFile(url, "utf8");
}

test("core skill retains the normal atomic commit safety contract", async () => {
	const core = await readSkill(skillUrl);

	assert.match(core, /atomic|coherent/i);
	assert.match(core, /explicit/i);
	assert.match(core, /unrelated/i);
	assert.match(core, /default branch|main/i);
	assert.match(core, /<emoji> <type>/i);
	assert.match(core, /closes #/i);
	assert.match(core, /--no-verify/i);
	assert.match(core, /hook/i);
	assert.match(core, /do not push|only commit/i);
	assert.match(core, /never force push/i);
	assert.match(core, /hash/i);
});

test("core routes only explicit history work to the conditional fixup reference", async () => {
	const core = await readSkill(skillUrl);

	assert.match(core, /explicit.*fixup|fixup.*explicit/i);
	assert.match(core, /FIXUP\.md/);
	assert.match(core, /fixup.*amend.*autosquash.*history rewrite/i);
	assert.match(core, /ordinary|normal/i);
	assert.match(core, /do not (?:read|load).*FIXUP\.md/i);

	assert.doesNotMatch(core, /git commit --fixup/);
	assert.doesNotMatch(core, /GIT_SEQUENCE_EDITOR/);
	assert.doesNotMatch(core, /git rebase -i --autosquash/);
	assert.doesNotMatch(core, /amend! <exact original subject>/);
});

test("conditional reference owns fixup and rewrite guidance with authorization safeguards", async () => {
	const fixup = await readSkill(fixupUrl);

	assert.match(fixup, /git commit --fixup/);
	assert.match(fixup, /amend!/);
	assert.match(fixup, /GIT_SEQUENCE_EDITOR/);
	assert.match(fixup, /multiple fixup|batch/i);
	assert.match(fixup, /explicit.*(?:authorization|asks|approval)/i);
	assert.match(fixup, /never force push/i);
});
