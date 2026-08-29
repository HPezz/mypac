import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("./SKILL.md", import.meta.url);
const fixupUrl = new URL("./FIXUP.md", import.meta.url);

async function readSkill(url) {
	return readFile(url, "utf8");
}

function assertOrdered(text, patterns) {
	let previousIndex = -1;

	for (const pattern of patterns) {
		const match = pattern.exec(text);
		assert.ok(match, `missing ${pattern}`);
		assert.ok(match.index > previousIndex, `${pattern} is out of order`);
		previousIndex = match.index;
	}
}

test("core skill retains the normal atomic commit safety contract", async () => {
	const core = await readSkill(skillUrl);

	assert.match(core, /atomic|coherent/i);
	assert.match(core, /explicit/i);
	assert.match(core, /unrelated/i);
	assert.match(core, /default branch|main/i);
	assert.match(core, /<emoji> <type>/i);
	assert.match(core, /--no-verify/i);
	assert.match(core, /hook/i);
	assert.match(core, /do not push|only commit/i);
	assert.match(core, /force.push|history rewrite/i);
	assert.match(core, /hash/i);
});

test("core resolves commit permission before applying commit procedure", async () => {
	const core = await readSkill(skillUrl);

	assertOrdered(core, [
		/resolve whether (?:Pi|the agent) may create commits/i,
		/(?:atomic|coherent) commit/i,
	]);
	assert.match(core, /repository.*user.*(?:prohibit|defer)|(?:prohibit|defer).*repository.*user/i);
	assert.match(core, /do not commit|stop before commit/i);
});

test("core resolves message policy progressively before the mypac fallback", async () => {
	const core = await readSkill(skillUrl);

	assertOrdered(core, [
		/explicit repository.*(?:guidance|policy)|(?:guidance|policy).*explicit repository/i,
		/(?:small|narrow).*(?:recent history|recent commit)/i,
		/mypac.*(?:final )?fallback|(?:final )?fallback.*mypac/i,
	]);
	assert.match(core, /explicit user.*explicit repository|explicit repository.*explicit user/i);
	assert.match(core, /history.*only.*(?:unresolved|absent)|only.*(?:unresolved|absent).*history/i);
	assert.match(core, /clear|established convention/i);
	assert.match(core, /repository.*(?:format|convention).*(?:wins|applies|authoritative)|(?:wins|applies|authoritative).*repository.*(?:format|convention)/i);
});

test("core composes universal authorization floors with stronger local restrictions", async () => {
	const core = await readSkill(skillUrl);

	assert.match(core, /explicit authorization.*force.push|force.push.*explicit authorization/i);
	assert.match(core, /stronger.*(?:repository|user).*(?:restriction|prohibition)|(?:repository|user).*(?:restriction|prohibition).*stronger/i);
});

test("core separates issue association from authoritative closure decisions", async () => {
	const core = await readSkill(skillUrl);

	assert.match(core, /association.*closure|closure.*association/i);
	assert.match(core, /authoritative evidence.*fully resolves|fully resolves.*authoritative evidence/i);
	assert.match(core, /repository.*(?:permits|workflow|convention).*(?:closing|closure)|(?:closing|closure).*repository.*(?:permits|workflow|convention)/i);
	assert.match(core, /non-closing reference/i);
	assert.match(core, /re-?check.*state.*(?:hook|verification)|(?:hook|verification).*re-?check.*state/i);
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
	assert.match(fixup, /force.push/i);
	assert.match(fixup, /stronger.*(?:repository|user).*(?:restriction|prohibition)|(?:repository|user).*(?:restriction|prohibition).*stronger/i);
});
