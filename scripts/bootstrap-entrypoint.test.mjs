import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptsDir, "..");
const installSource = join(scriptsDir, "install.sh");
const environmentSource = join(rootDir, ".mise", "global-environment");
const syncSource = join(rootDir, ".mise", "tasks", "sync.sh");

function writeCommand(bin, name, body) {
	const path = join(bin, name);
	writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
	chmodSync(path, 0o755);
}

test("canonical install disables mise task auto-install before bootstrap", (t) => {
	const root = mkdtempSync(join(tmpdir(), "mypac-install-entrypoint-"));
	const bin = join(root, "bin");
	const log = join(root, "commands.log");
	mkdirSync(join(root, "scripts"));
	mkdirSync(bin);
	writeFileSync(join(root, "scripts", "install.sh"), readFileSync(installSource, "utf8"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	writeCommand(
		bin,
		"mise",
		`printf '%s\\t%s\\n' "\${MISE_TASK_RUN_AUTO_INSTALL:-}" "$*" >> ${JSON.stringify(log)}`,
	);

	const result = spawnSync("/bin/bash", [join(root, "scripts", "install.sh")], {
		cwd: root,
		env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(log, "utf8"), "false\trun bootstrap\n");
});

test("npm remains owned by the pinned Node artifact instead of a second desired-state pin", () => {
	const desiredState = readFileSync(environmentSource, "utf8");
	const sync = readFileSync(syncSource, "utf8");

	assert.doesNotMatch(desiredState, /^foundation\s+mise\s+npm@/m);
	assert.doesNotMatch(sync, /require_mise_command\s+npm\s+[0-9]/);
	assert.match(sync, /npm must be supplied by the pinned mise-managed Node installation/);
});
