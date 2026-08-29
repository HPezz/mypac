import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function readRepoFile(path) {
	return readFile(new URL(path, root), "utf8");
}

test("CONTEXT.md defines compositional behavior ownership", async () => {
	const context = await readRepoFile("CONTEXT.md");

	assert.match(context, /behavior ownership is compositional, not a linear precedence stack/i);
	assert.match(context, /shared guidance.*safety floors/is);
	assert.match(context, /repository policy.*commit-message conventions.*branch naming.*verification commands.*merge strategy/is);
	assert.match(context, /skills.*task-specific procedure/is);
	assert.match(context, /prompts.*entrypoints/is);
	assert.match(context, /may strengthen.*cannot weaken/is);
	assert.match(context, /contradictory.*stop.*request resolution/is);
});

test("shared guidance keeps universal repository safety floors without prescribing local policy", async () => {
	const shared = await readRepoFile("shared/SHARED_APPEND_SYSTEM.md");

	assert.match(shared, /inspect repository state.*actual default branch.*before the first implementation mutation/is);
	assert.match(shared, /do not (?:make )?implementation changes.*actual default branch/i);
	assert.match(shared, /preserve unrelated.*explicit.*scoped staging/is);
	assert.match(shared, /whether Pi creates commits.*separate.*commit quality/is);
	assert.match(shared, /when Pi creates commits.*coherent.*proportionate verification/is);
	assert.match(shared, /explicit authorization.*push.*merge.*force-push.*history rewrite/is);
	assert.match(shared, /repository policy may strengthen.*but (?:may )?not weaken/is);

	assert.doesNotMatch(shared, /gitmoji|conventional commits|closes #|npm (?:test|run)|merge strategy/i);
});
