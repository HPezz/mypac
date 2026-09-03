import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSlidedeckPrompt } from "../../extensions/slidedeck/helpers.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("slidedeck keeps portable presentation design in one canonical skill", async () => {
	const [skill, extension] = await Promise.all([
		read("./SKILL.md"),
		read("../../extensions/slidedeck/helpers.ts"),
	]);
	const prompt = buildSlidedeckPrompt("Turn this launch plan into slides");

	assert.match(skill, /name:\s*pac-slidedeck/i);
	assert.match(skill, /explicitly asks for a presentation, slides, or a slide deck—not for ordinary document generation/i);
	assert.match(skill, /coherent presentation narrative, not a document split across slides/i);
	assert.match(skill, /roughly 4[–-]10 slides/i);
	assert.match(skill, /each slide one main idea/i);
	assert.match(skill, /concise titles and scanable content/i);
	assert.match(skill, /strong visual hierarchy/i);
	assert.match(skill, /cover[\s\S]*section divider[\s\S]*comparison[\s\S]*cards[\s\S]*KPI[\s\S]*statement[\s\S]*quote[\s\S]*steps[\s\S]*table/i);
	assert.match(skill, /make only the requested or proportionate changes/i);
	assert.match(skill, /Preserve untouched slides and content/i);
	assert.match(skill, /host environment's native presentation or artifact capability/i);
	assert.doesNotMatch(skill, /save_slidedeck|~\/\.pi|<html>|CSS|JavaScript|revision|session state/i);

	assert.ok(prompt.includes(skill.trim()), "Pi prompt should consume the canonical skill verbatim at runtime");
	assert.match(extension, /skills\/pac-slidedeck\/SKILL\.md/);
});
