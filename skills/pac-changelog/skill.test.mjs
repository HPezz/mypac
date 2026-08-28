import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("./SKILL.md", import.meta.url);

test("normal updates read only the relevant changelog section", async () => {
  const skill = await readFile(skillUrl, "utf8");

  assert.equal(
    (skill.match(/Read only the relevant `## \[Unreleased\]` section of `CHANGELOG\.md`\./g) ?? []).length,
    2,
  );
});
