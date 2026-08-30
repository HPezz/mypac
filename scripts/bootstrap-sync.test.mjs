import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const installSource = join(scriptsDir, "install.sh");
const bootstrapSource = join(scriptsDir, "..", ".mise", "tasks", "bootstrap.sh");
const configSource = join(scriptsDir, "..", ".mise", "config.toml");
const syncSource = join(scriptsDir, "..", ".mise", "tasks", "sync.sh");
const environmentSource = join(scriptsDir, "..", ".mise", "global-environment");

function createFixture(t) {
	const root = mkdtempSync(join(tmpdir(), "mypac-bootstrap-"));
	const bin = join(root, "bin");
	mkdirSync(join(root, "scripts"));
	mkdirSync(bin);
	cpSync(installSource, join(root, "scripts", "install.sh"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return { root, bin, log: join(root, "commands.log") };
}

function writeCommand(bin, name, body) {
	const path = join(bin, name);
	writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
	chmodSync(path, 0o755);
}

function runInstall(fixture) {
	return spawnSync("/bin/bash", [join(fixture.root, "scripts", "install.sh")], {
		cwd: fixture.root,
		env: { ...process.env, PATH: `${fixture.bin}:/usr/bin:/bin` },
		encoding: "utf8",
	});
}

test("install delegates setup to mise run bootstrap", (t) => {
	const fixture = createFixture(t);
	writeCommand(fixture.bin, "mise", `printf '%s\\n' "$*" >> ${JSON.stringify(fixture.log)}`);

	const result = runInstall(fixture);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(fixture.log, "utf8"), "run bootstrap\n");
});

test("install fails with actionable guidance when mise is missing", (t) => {
	const fixture = createFixture(t);

	const result = runInstall(fixture);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /mise is required/);
	assert.match(result.stderr, /https:\/\/mise\.jdx\.dev/);
});

function createBootstrapFixture(t) {
	const fixture = createFixture(t);
	mkdirSync(join(fixture.root, ".mise", "tasks"), { recursive: true });
	cpSync(bootstrapSource, join(fixture.root, ".mise", "tasks", "bootstrap.sh"));
	return fixture;
}

function runBootstrap(fixture) {
	return spawnSync("/bin/bash", [join(fixture.root, ".mise", "tasks", "bootstrap.sh")], {
		cwd: fixture.root,
		env: { ...process.env, PATH: `${fixture.bin}:/usr/bin:/bin` },
		encoding: "utf8",
	});
}

test("bootstrap installs the checkout then invokes global sync", (t) => {
	const fixture = createBootstrapFixture(t);
	for (const command of ["npm", "mise", "pi"]) {
		writeCommand(
			fixture.bin,
			command,
			`printf '${command}\\t%s\\n' "$*" >> ${JSON.stringify(fixture.log)}`,
		);
	}

	const result = runBootstrap(fixture);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		readFileSync(fixture.log, "utf8"),
		["npm\tci", "mise\tinstall", "mise\trun hooks", "mise\trun sync", ""].join("\n"),
	);
});

test("bootstrap fails with actionable guidance when Pi is missing", (t) => {
	const fixture = createBootstrapFixture(t);
	writeCommand(fixture.bin, "npm", "exit 0");
	writeCommand(fixture.bin, "mise", "exit 0");

	const result = runBootstrap(fixture);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Pi is required/);
});

test("checkout declares uv dependency for pipx-backed tools", () => {
	const config = readFileSync(configSource, "utf8");
	const environment = readFileSync(environmentSource, "utf8");
	const globalUvVersion = environment.match(/^mise uv@(\S+)$/m)?.[1];
	const checkoutUvVersion = config.match(/^uv = "([^"]+)"$/m)?.[1];
	const yamllintDeclaration = config.match(/^yamllint = \{(.+)\}$/m)?.[1];

	assert.ok(globalUvVersion, "global environment must declare uv");
	assert.equal(checkoutUvVersion, globalUvVersion);
	assert.match(yamllintDeclaration ?? "", /depends = "uv"/);
	assert.doesNotMatch(config, /^jobs\s*=/m);
});

function loggingCommand(fixture, name, extra = "") {
	writeCommand(
		fixture.bin,
		name,
		`printf '${name}' >> ${JSON.stringify(fixture.log)}\nprintf '\\t%s' "$@" >> ${JSON.stringify(fixture.log)}\nprintf '\\n' >> ${JSON.stringify(fixture.log)}\n${extra}\ntrue`,
	);
}

function createSyncFixture(t, suffix = "") {
	const parent = realpathSync(mkdtempSync(join(tmpdir(), "mypac-sync-")));
	const root = join(parent, `checkout${suffix}`);
	const bin = join(parent, "bin");
	const home = join(parent, "home");
	mkdirSync(join(root, ".mise", "tasks"), { recursive: true });
	mkdirSync(bin);
	mkdirSync(home);
	cpSync(syncSource, join(root, ".mise", "tasks", "sync.sh"));
	cpSync(environmentSource, join(root, ".mise", "global-environment"));
	const fixture = { root, bin, home, log: join(parent, "commands.log") };
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	return fixture;
}

function installSyncCommands(fixture, { uvVersion = "0.12.6" } = {}) {
	loggingCommand(fixture, "mise");
	loggingCommand(
		fixture,
		"uv",
		`[[ "\${1:-}" == "--version" ]] && echo "uv ${uvVersion}"`,
	);
	loggingCommand(fixture, "headroom", '[[ "${1:-}" == "--version" ]] && echo "headroom, version 0.36.5"');
	loggingCommand(fixture, "agent-browser", '[[ "${1:-}" == "--version" ]] && echo "agent-browser 0.34.0"');
	loggingCommand(
		fixture,
		"pi",
		`if [[ "\${1:-}" == "list" ]]; then\n\tprintf '%s\\n' 'npm:pi-agent-browser-native@0.5.0' 'npm:pi-codex-search@0.1.6' ${JSON.stringify(fixture.root)}\nfi`,
	);
	loggingCommand(
		fixture,
		"npm",
		`[[ "$PWD" != ${JSON.stringify(fixture.root)} ]] || { echo "doctor ran from the mypac checkout" >&2; exit 1; }`,
	);
}

function installRefreshDependentCommands(fixture) {
	const available = join(dirname(fixture.bin), "available");
	const toolsBin = join(dirname(fixture.bin), "mise-tools");
	mkdirSync(available);
	mkdirSync(toolsBin);
	writeCommand(available, "uv", '[[ "${1:-}" == "--version" ]] && echo "uv 0.12.6"\ntrue');
	writeCommand(available, "headroom", '[[ "${1:-}" == "--version" ]] && echo "headroom, version 0.36.5"\ntrue');
	writeCommand(available, "agent-browser", '[[ "${1:-}" == "--version" ]] && echo "agent-browser 0.34.0"\ntrue');
	writeCommand(
		fixture.bin,
		"mise",
		[
			`printf 'mise' >> ${JSON.stringify(fixture.log)}`,
			`printf '\\t%s' "$@" >> ${JSON.stringify(fixture.log)}`,
			`printf '\\n' >> ${JSON.stringify(fixture.log)}`,
			'case "$*" in',
			`  "use --global uv@0.12.6") cp ${JSON.stringify(join(available, "uv"))} ${JSON.stringify(join(toolsBin, "uv"))} ;;`,
			`  "use --global pipx:headroom-ai[extras=all]@0.36.5") command -v uv >/dev/null; cp ${JSON.stringify(join(available, "headroom"))} ${JSON.stringify(join(toolsBin, "headroom"))} ;;`,
			`  "use --global npm:agent-browser@0.34.0") cp ${JSON.stringify(join(available, "agent-browser"))} ${JSON.stringify(join(toolsBin, "agent-browser"))} ;;`,
			`  "env -s bash") printf 'export PATH=%q\\n' ${JSON.stringify(`${toolsBin}:$PATH`)} ;;`,
			'esac',
		].join("\n"),
	);
	loggingCommand(
		fixture,
		"pi",
		`if [[ "\${1:-}" == "list" ]]; then\n\tprintf '%s\\n' 'npm:pi-agent-browser-native@0.5.0' 'npm:pi-codex-search@0.1.6' ${JSON.stringify(fixture.root)}\nfi`,
	);
	loggingCommand(
		fixture,
		"npm",
		`[[ "$PWD" != ${JSON.stringify(fixture.root)} ]] || { echo "doctor ran from the mypac checkout" >&2; exit 1; }`,
	);
}

function runSync(fixture) {
	return spawnSync("/bin/bash", [join(fixture.root, ".mise", "tasks", "sync.sh")], {
		cwd: fixture.root,
		env: { ...process.env, HOME: fixture.home, PATH: `${fixture.bin}:/usr/bin:/bin` },
		encoding: "utf8",
	});
}

test("sync reconciles and verifies the pinned global environment", (t) => {
	const fixture = createSyncFixture(t);
	installSyncCommands(fixture);

	const result = runSync(fixture);

	assert.equal(
		result.status,
		0,
		`${result.stderr}\n${result.stdout}\n${readFileSync(fixture.log, "utf8")}`,
	);
	assert.deepEqual(readFileSync(fixture.log, "utf8").trim().split("\n"), [
		"mise\tuse\t--global\tuv@0.12.6",
		"mise\tenv\t-s\tbash",
		"mise\tuse\t--global\tpipx:headroom-ai[extras=all]@0.36.5",
		"mise\tenv\t-s\tbash",
		"mise\tuse\t--global\tnpm:agent-browser@0.34.0",
		"mise\tenv\t-s\tbash",
		"pi\tinstall\tnpm:pi-agent-browser-native@0.5.0",
		"pi\tinstall\tnpm:pi-codex-search@0.1.6",
		`pi\tinstall\t${fixture.root}`,
		`mise\tset\t--global\tAGENT_BROWSER_SCREENSHOT_DIR=${fixture.home}/dev/agent-browser/screenshots`,
		"mise\tenv\t-s\tbash",
		"agent-browser\tinstall",
		"uv\t--version",
		"headroom\t--version",
		"agent-browser\t--version",
		"pi\tlist\t--no-approve",
		"npm\texec\t--yes\t--package\tpi-agent-browser-native@0.5.0\t--\tpi-agent-browser-doctor",
	]);
});

test("sync persists the browser screenshot directory through mise", (t) => {
	const fixture = createSyncFixture(t);
	const screenshotDir = join(fixture.home, "dev", "agent-browser", "screenshots");
	installSyncCommands(fixture);
	assert.equal(existsSync(screenshotDir), false);

	const result = runSync(fixture);

	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(screenshotDir), true);
	assert.match(
		readFileSync(fixture.log, "utf8"),
		new RegExp(`mise\\tset\\t--global\\tAGENT_BROWSER_SCREENSHOT_DIR=${screenshotDir}$`, "m"),
	);
});

test("sync refreshes PATH between ordered mise declarations", (t) => {
	const fixture = createSyncFixture(t);
	installRefreshDependentCommands(fixture);
	const beforeSync = spawnSync("/bin/bash", ["-c", "command -v uv"], {
		env: { ...process.env, PATH: `${fixture.bin}:/usr/bin:/bin` },
	});
	assert.notEqual(beforeSync.status, 0, "uv must be absent before the first mise declaration");

	const result = runSync(fixture);

	assert.equal(
		result.status,
		0,
		`${result.stderr}\n${result.stdout}\n${readFileSync(fixture.log, "utf8")}`,
	);
	assert.match(readFileSync(fixture.log, "utf8"), /mise\tuse\t--global\tpipx:headroom-ai\[extras=all\]@0\.36\.5/);
});

test("sync applies a changed checked-in version and remains safe to rerun", (t) => {
	const fixture = createSyncFixture(t);
	const desiredState = join(fixture.root, ".mise", "global-environment");
	writeFileSync(
		desiredState,
		readFileSync(desiredState, "utf8").replace("uv@0.12.6", "uv@0.12.7"),
	);
	installSyncCommands(fixture, { uvVersion: "0.12.7" });

	const first = runSync(fixture);
	const firstCommands = readFileSync(fixture.log, "utf8");
	const second = runSync(fixture);
	const allCommands = readFileSync(fixture.log, "utf8");

	assert.equal(first.status, 0, first.stderr);
	assert.equal(second.status, 0, second.stderr);
	assert.match(firstCommands, /mise\tuse\t--global\tuv@0\.12\.7/);
	assert.equal(allCommands, firstCommands.repeat(2));
});

test("sync does not remove components deleted from desired state", (t) => {
	const fixture = createSyncFixture(t);
	writeFileSync(join(fixture.root, ".mise", "global-environment"), "# No global components declared.\n");
	installSyncCommands(fixture);

	const result = runSync(fixture);

	assert.equal(result.status, 0, result.stderr);
	const commands = readFileSync(fixture.log, "utf8");
	assert.equal(commands, `pi\tinstall\t${fixture.root}\npi\tlist\t--no-approve\n`);
	assert.doesNotMatch(commands, /remove|uninstall/);
});

test("sync passes a checkout path containing spaces as one Pi argument", (t) => {
	const fixture = createSyncFixture(t, " with spaces");
	installSyncCommands(fixture);

	const result = runSync(fixture);

	assert.equal(result.status, 0, result.stderr);
	assert.match(readFileSync(fixture.log, "utf8"), new RegExp(`pi\\tinstall\\t${fixture.root}$`, "m"));
});

test("sync fails with actionable guidance when Pi is missing", (t) => {
	const fixture = createSyncFixture(t);
	loggingCommand(fixture, "mise");

	const result = runSync(fixture);

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Pi is required/);
});
