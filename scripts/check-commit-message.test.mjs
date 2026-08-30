import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(rootDir, "scripts", "check-commit-message.sh");
const hkConfigPath = join(rootDir, ".config", "hk.pkl");

function checkMessage(t, message) {
	const dir = mkdtempSync(join(tmpdir(), "check-commit-message-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const messagePath = join(dir, "COMMIT_EDITMSG");
	writeFileSync(messagePath, message);
	return spawnSync("sh", [scriptPath, messagePath], { encoding: "utf8" });
}

test("hk registers the repository-local commit-msg check", () => {
	const config = readFileSync(hkConfigPath, "utf8");

	assert.match(config, /\["commit-msg"\][\s\S]*check-commit-message\.sh \{\{commit_msg_file\}\}/);
});

test("rejects literal backslash-n text in a commit message", (t) => {
	const result = checkMessage(t, String.raw`fix: subject\n\nMalformed body`);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /literal \\n/);
});

test("allows genuine multiline commit messages", (t) => {
	const result = checkMessage(t, "fix: subject\n\nGenuine body\n");

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
});
