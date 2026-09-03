import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptsDir, "..");
const tasksDir = join(rootDir, ".mise", "tasks");

function runTask(t, task) {
	const root = mkdtempSync(join(tmpdir(), "mypac-chatgpt-skills-mise-"));
	const bin = join(root, "bin");
	const log = join(root, "commands.log");
	mkdirSync(join(root, ".mise", "tasks", dirname(task)), { recursive: true });
	mkdirSync(bin);
	cpSync(join(tasksDir, `${task}.sh`), join(root, ".mise", "tasks", `${task}.sh`));
	writeFileSync(
		join(bin, "npm"),
		`#!/usr/bin/env bash\nset -euo pipefail\nprintf 'npm\\t%s\\n' "$*" >> ${JSON.stringify(log)}\n`,
	);
	chmodSync(join(bin, "npm"), 0o755);
	t.after(() => rmSync(root, { recursive: true, force: true }));

	const result = spawnSync("/bin/bash", [join(root, ".mise", "tasks", `${task}.sh`)], {
		cwd: root,
		env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
		encoding: "utf8",
	});
	return { result, log };
}

test("checkout dependency task runs npm ci in a checkout without node_modules", (t) => {
	const { result, log } = runTask(t, "deps");

	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(log, "utf8"), "npm\tci\n");
});

test("ChatGPT export depends on checkout dependencies and includes reference validation", (t) => {
	const source = readFileSync(join(tasksDir, "chatgpt-skills", "export.sh"), "utf8");
	const { result, log } = runTask(t, join("chatgpt-skills", "export"));

	assert.match(source, /^#MISE depends=\["deps"\]$/m);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
		"npm\trun export:chatgpt-skills",
		"npm\trun validate:chatgpt-skills:reference",
	]);
});

test("ChatGPT validation checks existing artifacts without rebuilding", (t) => {
	const source = readFileSync(join(tasksDir, "chatgpt-skills", "validate.sh"), "utf8");
	const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
	const { result, log } = runTask(t, join("chatgpt-skills", "validate"));

	assert.match(source, /^#MISE depends=\["deps"\]$/m);
	assert.doesNotMatch(packageJson.scripts["validate:chatgpt-skills:reference"], /export:chatgpt-skills/);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(log, "utf8"), "npm\trun validate:chatgpt-skills:reference\n");
});
