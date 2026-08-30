import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("session review stays explicit, progressive, evidence-based, and ownership-routed", async () => {
	const [skill, prompt] = await Promise.all([read("./SKILL.md"), read("../../prompts/pac-session-review.md")]);

	assert.match(skill, /disable-model-invocation:\s*true/i);
	assert.match(skill, /metadata-only.*(?:first|before)/is);
	assert.match(skill, /one selected session/i);
	assert.match(skill, /bounded.*events/i);
	assert.match(skill, /24 events.*240 characters/i);
	assert.match(skill, /startSequence.*without preceding events.*nextStartSequence/is);
	assert.match(skill, /reuse the selected metadata file path.*do not substitute.*PI_SESSION_FILE/is);
	assert.match(skill, /never call the `read` tool on session JSONL/i);
	assert.match(skill, /prints only.*parseCompactPiSessionEvents/is);
	assert.match(skill, /targeted expansion.*only/i);
	assert.match(skill, /normal exploration.*TDD.*diagnosis/is);
	assert.match(skill, /current authoritative artifact/i);
	assert.match(skill, /no change/i);
	assert.match(skill, /#411/);
	assert.match(skill, /shared guidance.*repository policy.*skills.*prompts.*deterministic tooling.*conditional support/is);
	assert.match(skill, /pac-eval.*optional/i);
	assert.doesNotMatch(skill, /automatically.*pac-eval/i);

	assert.match(prompt, /explicit session review/i);
	assert.match(prompt, /skills\/pac-session-review\/SKILL\.md/);
	assert.match(prompt, /\*\*Provided arguments\*\*: \$@\s*$/);
});
