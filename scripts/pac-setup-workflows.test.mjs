import test from "node:test";
import assert from "node:assert/strict";
import { isAffirmativeConfirmation, parseCliCommand } from "./pac-setup-workflows.ts";

test("parseCliCommand defaults to labels check", () => {
	assert.deepEqual(parseCliCommand([]), { action: "check", repo: undefined, yes: false });
});

test("parseCliCommand parses check with repo", () => {
	assert.deepEqual(parseCliCommand(["labels", "check", "--repo", "ladislas/mypac"]), {
		action: "check",
		repo: "ladislas/mypac",
		yes: false,
	});
});

test("parseCliCommand accepts nested self-hosted GitLab project URLs", () => {
	assert.deepEqual(parseCliCommand(["labels", "check", "--repo", "https://git.example.com/group/subgroup/app"]), {
		action: "check",
		repo: "https://git.example.com/group/subgroup/app",
		yes: false,
	});
});

test("parseCliCommand parses apply with explicit yes", () => {
	assert.deepEqual(parseCliCommand(["labels", "apply", "--repo=ladislas/mypac", "--yes"]), {
		action: "apply",
		repo: "ladislas/mypac",
		yes: true,
	});
});

test("parseCliCommand preserves parse errors", () => {
	assert.deepEqual(parseCliCommand(["labels", "check", "--repo", "mypac"]), {
		action: "error",
		message: "Invalid --repo value: mypac",
		yes: false,
	});
});

test("isAffirmativeConfirmation requires yes", () => {
	assert.equal(isAffirmativeConfirmation("yes"), true);
	assert.equal(isAffirmativeConfirmation(" YES \n"), true);
	assert.equal(isAffirmativeConfirmation("y"), false);
	assert.equal(isAffirmativeConfirmation(""), false);
});
