import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const here = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(here, "../..");
const readRepo = (...segments) => readFile(path.join(repoRoot, ...segments), "utf8");

async function build() {
	const root = await mkdtemp(path.join(os.tmpdir(), "mypac-downstream-behavior-"));
	execFileSync("node", [path.join(here, "build-fixtures.mjs"), root], { cwd: repoRoot });
	return root;
}

test("builds three disposable downstream Git repositories with the intended policy shapes", async (t) => {
	const root = await build();
	t.after(() => rm(root, { recursive: true, force: true }));
	const git = (repository, ...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();

	for (const [id, defaultBranch] of [["main-fallback", "main"], ["develop-local", "develop"], ["guarded-hook", "main"]]) {
		const repository = path.join(root, "repositories", id);
		assert.equal(git(repository, "branch", "--show-current"), defaultBranch);
		assert.equal(git(repository, "status", "--porcelain=v1"), "");
		assert.equal(git(repository, "tag", "--list", "fixture-baseline"), "fixture-baseline");
	}

	await assert.rejects(readFile(path.join(root, "repositories", "main-fallback", "AGENTS.md"), "utf8"));
	const local = await readFile(path.join(root, "repositories", "develop-local", "AGENTS.md"), "utf8");
	assert.match(local, /downstream\/validate-policy/);
	assert.match(local, /DOWNSTREAM: <lowercase imperative summary>/);
	const guarded = await readFile(path.join(root, "repositories", "guarded-hook", "AGENTS.md"), "utf8");
	assert.match(guarded, /must never push.*even when.*grants push authorization/is);
	assert.match(guarded, /after committing, re-check repository state.*hook mutations/is);
});

test("generated fresh-session manifests cover natural-language and pac-lwot without a Cartesian product", async (t) => {
	const root = await build();
	t.after(() => rm(root, { recursive: true, force: true }));
	const manifests = await Promise.all(["main-fallback", "develop-local", "guarded-hook"].map(async (id) =>
		JSON.parse(await readFile(path.join(root, "manifests", `${id}.json`), "utf8"))));

	assert.deepEqual(manifests.map(({ profiles }) => profiles[0].workflow ?? "natural-language"), [
		"natural-language",
		"/pac-lwot",
		"natural-language",
	]);
	assert.ok(manifests.every(({ profiles, scenarios }) => profiles.length === 1 && scenarios.length === 1));
	assert.match(manifests[0].scenarios[0].prompt, /not authorized to push or merge/i);
	assert.match(manifests[1].scenarios[0].prompt, /push only.*feature branch.*do not merge/i);
	assert.match(manifests[2].scenarios[0].prompt, /authorize pushing.*stronger repository restrictions/is);
});

test("static contracts assign policy ownership and keep commit, closure, and authorization gates separate", async () => {
	const [context, shared, commit, lwot] = await Promise.all([
		readRepo("CONTEXT.md"),
		readRepo("shared", "SHARED_APPEND_SYSTEM.md"),
		readRepo("skills", "pac-commit", "SKILL.md"),
		readRepo("prompts", "pac-lwot.md"),
	]);

	assert.match(context, /repository policy.*commit-message conventions.*branch naming.*verification commands.*merge strategy.*stronger safety restrictions/is);
	assert.match(context, /skills.*consume resolved repository policy/is);
	assert.match(shared, /explicit authorization for push, merge, force-push, and history rewrite/i);
	assert.match(commit, /repository message format.*authoritative.*wins/is);
	assert.match(commit, /mypac.*final fallback/is);
	assert.match(commit, /association separately.*closure/is);
	assert.match(commit, /push, merge.*each require explicit authorization/is);
	assert.match(commit, /re-check.*state.*hook/is);
	assert.match(lwot, /reuse applicable repository.*policy already available/is);
	assert.match(lwot, /do not broadly re-read `AGENTS\.md`/i);
	assert.match(commit, /may load.*before.*proportionate.*verification.*complete/is);
	assert.match(commit, /before.*git commit.*coherent slice.*(?:proportionate verification.*complete|strongest available evidence.*gathered).*commit creation.*allowed/is);
	assert.match(lwot, /exact.*(?:skill )?read order.*efficiency goal.*not.*(?:safety|correctness) guarantee/is);
	assert.match(lwot, /before.*git commit.*coherent slice.*(?:proportionate verification.*complete|strongest available evidence.*gathered).*commit creation.*allowed/is);
	assert.doesNotMatch(lwot, /pac-commit.*only when.*verified/is);
	assert.match(lwot, /do not infer push or merge authorization/is);
});

test("evidence ledger distinguishes static, fresh-session, and reused claims", async () => {
	const evidence = await readFile(new URL("./EVIDENCE.md", import.meta.url), "utf8");
	assert.match(evidence, /## Static proof/);
	assert.match(evidence, /## Fresh-session proof/);
	assert.match(evidence, /## Reused #366 evidence/);
	assert.match(evidence, /high-level read\/tool sequence/i);
	assert.match(evidence, /read order.*efficiency observation.*not.*(?:pass|fail)/is);
	assert.match(evidence, /before `git commit`.*coherent slice.*(?:proportionate verification|strongest available evidence).*permission/is);
	assert.match(evidence, /static.*fresh-session/is);
});
