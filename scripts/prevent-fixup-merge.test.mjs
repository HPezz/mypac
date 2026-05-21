import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const scriptSource = join(testDir, "prevent-fixup-merge.sh");

function run(command, args, options = {}) {
	const { allowFailure, ...spawnOptions } = options;
	const result = spawnSync(command, args, {
		encoding: "utf8",
		...spawnOptions,
	});

	if (allowFailure !== true && result.status !== 0) {
		throw new Error([
			`Command failed: ${command} ${args.join(" ")}`,
			`status: ${result.status}`,
			`stdout: ${result.stdout}`,
			`stderr: ${result.stderr}`,
		].join("\n"));
	}

	return result;
}

function createRepo(t) {
	const dir = mkdtempSync(join(tmpdir(), "prevent-fixup-merge-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	cpSync(scriptSource, join(dir, "prevent-fixup-merge.sh"));
	run("git", ["init", "--initial-branch=main"], { cwd: dir });
	run("git", ["config", "user.name", "Test User"], { cwd: dir });
	run("git", ["config", "user.email", "test@example.com"], { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "base\n");
	run("git", ["add", "file.txt"], { cwd: dir });
	run("git", ["commit", "-m", "base"], { cwd: dir });
	return dir;
}

function commitOnBranch(repo, branch, subject) {
	run("git", ["switch", "-c", branch], { cwd: repo });
	appendFileSync(join(repo, "file.txt"), `${subject}\n`);
	run("git", ["add", "file.txt"], { cwd: repo });
	run("git", ["commit", "-m", subject], { cwd: repo });
	run("git", ["switch", "main"], { cwd: repo });
}

function startMerge(repo, branch) {
	run("git", ["merge", "--no-ff", "--no-commit", branch], { cwd: repo });
}

function revParse(repo, ref) {
	return run("git", ["rev-parse", ref], { cwd: repo }).stdout.trim();
}

function prePushInput(localOid, remoteOid = "0000000000000000000000000000000000000000") {
	return `refs/heads/main ${localOid} refs/heads/main ${remoteOid}\n`;
}

test("allows a merge whose incoming commits do not start with fixup!", (t) => {
	const repo = createRepo(t);
	commitOnBranch(repo, "feature", "normal change");
	startMerge(repo, "feature");

	const result = run("sh", ["prevent-fixup-merge.sh"], { cwd: repo });

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
});

test("blocks a merge whose incoming commits include a fixup! subject", (t) => {
	const repo = createRepo(t);
	commitOnBranch(repo, "feature", "fixup! normal change");
	startMerge(repo, "feature");

	const result = run("sh", ["prevent-fixup-merge.sh"], { cwd: repo, allowFailure: true });

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Refusing to merge fixup! commits into main/);
	assert.match(result.stderr, /fixup! normal change/);
});

test("does not block fixup! commits when the current branch is not main", (t) => {
	const repo = createRepo(t);
	commitOnBranch(repo, "topic", "fixup! normal change");
	run("git", ["switch", "-c", "integration"], { cwd: repo });
	startMerge(repo, "topic");

	const result = run("sh", ["prevent-fixup-merge.sh"], { cwd: repo });

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
});

test("allows a push to main whose new commits do not start with fixup!", (t) => {
	const repo = createRepo(t);
	const remoteOid = revParse(repo, "main");
	commitOnBranch(repo, "feature", "normal change");
	const localOid = revParse(repo, "feature");

	const result = run("sh", ["prevent-fixup-merge.sh", "pre-push"], {
		cwd: repo,
		input: prePushInput(localOid, remoteOid),
	});

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
});

test("blocks a push to main whose new commits include a fixup! subject", (t) => {
	const repo = createRepo(t);
	const remoteOid = revParse(repo, "main");
	commitOnBranch(repo, "feature", "fixup! normal change");
	const localOid = revParse(repo, "feature");

	const result = run("sh", ["prevent-fixup-merge.sh", "pre-push"], {
		cwd: repo,
		input: prePushInput(localOid, remoteOid),
		allowFailure: true,
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Refusing to push fixup! commits to main/);
	assert.match(result.stderr, /fixup! normal change/);
});

test("fails closed when the pushed main range cannot be inspected", (t) => {
	const repo = createRepo(t);
	const missingOid = "1111111111111111111111111111111111111111";
	const localOid = revParse(repo, "main");

	const result = run("sh", ["prevent-fixup-merge.sh", "pre-push"], {
		cwd: repo,
		input: prePushInput(localOid, missingOid),
		allowFailure: true,
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Unable to inspect commits for range/);
});
