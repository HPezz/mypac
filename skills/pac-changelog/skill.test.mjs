import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("./SKILL.md", import.meta.url);

function workflowSection(skill, heading) {
  const match = skill.match(new RegExp(`### ${heading}\\n([\\s\\S]*?)(?=\\n### |\\n## |$)`));
  assert.ok(match, `missing ${heading} workflow section`);
  return match[1];
}

test("normal-update E2E targets the Unreleased heading by default", async () => {
  const skill = await readFile(skillUrl, "utf8");
  const normalUpdates = workflowSection(skill, "Normal updates");

  assert.match(skill, /By default, target the heading-delimited `## \[Unreleased\]` section\./);
  assert.match(normalUpdates, /^1\. Read the `## \[Unreleased\]` section of `CHANGELOG\.md`\./m);
});

test("release and retrospective E2E expand changelog reads only when needed", async () => {
  const skill = await readFile(skillUrl, "utf8");
  const normalUpdates = workflowSection(skill, "Normal updates");
  const releasePrep = workflowSection(skill, "Release prep");

  assert.match(skill, /concrete ambiguity/);
  assert.match(normalUpdates, /For retrospective updates, inspect.*only when needed/);
  assert.match(releasePrep, /^1\. Start with the `## \[Unreleased\]` section of `CHANGELOG\.md`\./m);
  assert.match(releasePrep, /Only when needed.*destination\/release structure/);
});
