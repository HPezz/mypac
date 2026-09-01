import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("deep read routes concise and rigorous analysis through one portable skill", async () => {
	const [skill, prompt, catalog] = await Promise.all([
		read("./SKILL.md"),
		read("../../prompts/pac-deep-read.md"),
		read("../../docs/catalog.md"),
	]);

	assert.match(skill, /name:\s*pac-deep-read/i);
	assert.match(skill, /Non-obvious insights[\s\S]*3[–-]5 implications/i);
	assert.match(skill, /concise mode.*default/is);
	assert.match(skill, /rigorous.*(?:long|evidence-backed|detailed)/is);
	assert.match(skill, /Evidence:\*\*.*verbatim.*5[–-]12 words/is);
	assert.match(skill, /Assumption:\*\*/i);
	assert.match(skill, /Confidence:\*\*\s*High\s*\/\s*Med\s*\/\s*Low/i);
	assert.match(skill, /Next action.*only.*organizational context/is);
	assert.match(skill, /omit.*organizational context.*absent/is);
	assert.doesNotMatch(skill, /(?:skills|prompts)\/pac-|\bgh\b|local scripts?|Pi-only/i);

	assert.match(prompt, /skills\/pac-deep-read\/SKILL\.md/);
	assert.match(prompt, /concise.*default/is);
	assert.match(prompt, /long.*rigorous/is);
	assert.doesNotMatch(prompt, /Evidence:|Assumption:|Confidence:|Blind spot:/i);
	assert.equal(prompt.match(/\$@/g)?.length, 1);
	assert.match(prompt, /\*\*Provided arguments\*\*: \$@\s*$/);

	assert.match(catalog, /pac-deep-read.*analy[sz]e documents/i);
});
