import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBlockedCommandMessage } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mypacRoot = resolve(__dirname, "../..");
const interceptedCommandsPath = resolve(__dirname, "intercepted-commands");

function pathWithoutCommands(...commandNames) {
	const commandPaths = commandNames.flatMap((command) => spawnSync("bash", ["-lc", 'type -aP "$1" 2>/dev/null || true', "_", command], {
		encoding: "utf8",
	}).stdout.trim().split("\n").filter(Boolean));
	const commandDirs = new Set(commandPaths.map((path) => dirname(path)));

	return (process.env.PATH ?? "")
		.split(":")
		.filter((path) => path && path !== interceptedCommandsPath && !commandDirs.has(path))
		.join(":");
}

function pathWithoutUv() {
	return pathWithoutCommands("uv");
}

function pathWithoutUvOrMise() {
	return pathWithoutCommands("uv", "mise");
}

// --- Allowed commands ---

test("allows plain uv commands", () => {
	assert.equal(getBlockedCommandMessage("uv run script.py"), null);
	assert.equal(getBlockedCommandMessage("uv add requests"), null);
	assert.equal(getBlockedCommandMessage("uv sync"), null);
});

test("allows python without blocked subcommands", () => {
	assert.equal(getBlockedCommandMessage("python script.py"), null);
	assert.equal(getBlockedCommandMessage("python3 --version"), null);
	assert.equal(getBlockedCommandMessage(".venv/bin/python script.py"), null);
});

// --- pip ---

test("blocks bare pip", () => {
	const msg = getBlockedCommandMessage("pip install requests");
	assert.ok(msg?.includes("pip is disabled"));
});

test("blocks pip3", () => {
	const msg = getBlockedCommandMessage("pip3 install requests");
	assert.ok(msg?.includes("pip3 is disabled"));
});

test("blocks pip after semicolon", () => {
	const msg = getBlockedCommandMessage("echo hi; pip install requests");
	assert.ok(msg?.includes("pip is disabled"));
});

test("blocks pip with explicit path", () => {
	const msg = getBlockedCommandMessage(".venv/bin/pip install requests");
	assert.ok(msg?.includes("pip is disabled"));
});

// --- poetry ---

test("blocks poetry", () => {
	const msg = getBlockedCommandMessage("poetry add requests");
	assert.ok(msg?.includes("poetry is disabled"));
	assert.ok(msg?.includes("uv add"));
});

// --- python -m pip ---

test("blocks python -m pip", () => {
	const msg = getBlockedCommandMessage("python -m pip install requests");
	assert.ok(msg?.includes("python -m pip' is disabled"));
});

test("blocks python3 -m pip", () => {
	const msg = getBlockedCommandMessage("python3 -m pip install requests");
	assert.ok(msg?.includes("python -m pip' is disabled"));
});

test("blocks .venv/bin/python -m pip", () => {
	const msg = getBlockedCommandMessage(".venv/bin/python -m pip install requests");
	assert.ok(msg?.includes("python -m pip' is disabled"));
});

// --- python -m venv ---

test("blocks python -m venv", () => {
	const msg = getBlockedCommandMessage("python -m venv .venv");
	assert.ok(msg?.includes("python -m venv' is disabled"));
	assert.ok(msg?.includes("uv venv"));
});

// --- python -m py_compile ---

test("blocks python -m py_compile", () => {
	const msg = getBlockedCommandMessage("python -m py_compile script.py");
	assert.ok(msg?.includes("py_compile' is disabled"));
	assert.ok(msg?.includes("uv run python -m ast"));
});

// --- multiline commands ---

test("blocks pip in multiline command", () => {
	const msg = getBlockedCommandMessage("echo start\npip install foo\necho done");
	assert.ok(msg?.includes("pip is disabled"));
});

test("python shim handles uv path containing spaces", () => {
	const tmp = mkdtempSync(join(tmpdir(), "uv path "));
	try {
		const managedPython = join(tmp, "managed-python");
		const fakeUv = join(tmp, "uv");
		writeFileSync(managedPython, "#!/usr/bin/env bash\nexit 0\n");
		chmodSync(managedPython, 0o755);
		writeFileSync(fakeUv, `#!/usr/bin/env bash
set -eu
if [ "$1" = "python" ] && [ "$2" = "find" ]; then
	printf '%s\n' "$FAKE_MANAGED_PYTHON"
	exit 0
fi
if [ "$1" = "run" ]; then
	printf 'UV_PYTHON=%s\n' "$3"
	exit 0
fi
exit 99
`);
		chmodSync(fakeUv, 0o755);

		const result = spawnSync(resolve(interceptedCommandsPath, "python3"), ["--version"], {
			env: {
				...process.env,
				FAKE_MANAGED_PYTHON: managedPython,
				PATH: `${tmp}:${interceptedCommandsPath}:${pathWithoutUv()}`,
			},
			encoding: "utf8",
		});

		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(result.stdout.trim(), `UV_PYTHON=${managedPython}`);
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
});

test("python shim ignores shell functions named uv", () => {
	const tmp = mkdtempSync(join(tmpdir(), "uv function "));
	try {
		const managedPython = join(tmp, "managed-python");
		const fakeUv = join(tmp, "uv");
		writeFileSync(managedPython, "#!/usr/bin/env bash\nexit 0\n");
		chmodSync(managedPython, 0o755);
		writeFileSync(fakeUv, `#!/usr/bin/env bash
set -eu
if [ "$1" = "python" ] && [ "$2" = "find" ]; then
	printf '%s\n' "$FAKE_MANAGED_PYTHON"
	exit 0
fi
if [ "$1" = "run" ]; then
	printf 'UV_PYTHON=%s\n' "$3"
	exit 0
fi
exit 99
`);
		chmodSync(fakeUv, 0o755);

		const result = spawnSync(resolve(interceptedCommandsPath, "python3"), ["--version"], {
			env: {
				...process.env,
				"BASH_FUNC_uv%%": "() { return 99; }",
				FAKE_MANAGED_PYTHON: managedPython,
				PATH: `${tmp}:${interceptedCommandsPath}:${pathWithoutUv()}`,
			},
			encoding: "utf8",
		});

		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(result.stdout.trim(), `UV_PYTHON=${managedPython}`);
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
});

test("python shim ignores shell functions named mise", () => {
	const tmp = mkdtempSync(join(tmpdir(), "mise function "));
	try {
		const managedPython = join(tmp, "managed-python");
		const fakeUv = join(tmp, "managed uv");
		const fakeMise = join(tmp, "mise");
		writeFileSync(managedPython, "#!/usr/bin/env bash\nexit 0\n");
		chmodSync(managedPython, 0o755);
		writeFileSync(fakeUv, `#!/usr/bin/env bash
set -eu
if [ "$1" = "python" ] && [ "$2" = "find" ]; then
	printf '%s\n' "$FAKE_MANAGED_PYTHON"
	exit 0
fi
if [ "$1" = "run" ]; then
	printf 'UV_PYTHON=%s\n' "$3"
	exit 0
fi
exit 99
`);
		chmodSync(fakeUv, 0o755);
		writeFileSync(fakeMise, `#!/usr/bin/env bash
set -eu
if [ "$1" = "which" ] && [ "$4" = "uv" ]; then
	printf '%s\n' "$FAKE_UV"
	exit 0
fi
exit 99
`);
		chmodSync(fakeMise, 0o755);

		const result = spawnSync(resolve(interceptedCommandsPath, "python3"), ["--version"], {
			env: {
				...process.env,
				"BASH_FUNC_mise%%": "() { return 99; }",
				FAKE_MANAGED_PYTHON: managedPython,
				FAKE_UV: fakeUv,
				PATH: `${tmp}:${interceptedCommandsPath}:${pathWithoutUv()}`,
			},
			encoding: "utf8",
		});

		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(result.stdout.trim(), `UV_PYTHON=${managedPython}`);
	} finally {
		rmSync(tmp, { force: true, recursive: true });
	}
});

// --- unavailable uv runtime ---

test("python shim uses mypac mise uv when uv unavailable on PATH", (t) => {
	const simulatedPath = pathWithoutUv();
	const misePath = spawnSync("bash", ["-lc", "type -P mise || true"], {
		env: { ...process.env, PATH: simulatedPath },
		encoding: "utf8",
	}).stdout.trim();
	const systemPython = spawnSync("bash", ["-lc", "command -v python3 || command -v python || true"], {
		env: { ...process.env, PATH: simulatedPath },
		encoding: "utf8",
	}).stdout.trim();

	if (!misePath) {
		t.skip("mise is unavailable on PATH");
		return;
	}
	if (!systemPython) {
		t.skip("no system Python available outside shim path");
		return;
	}

	const miseUvPath = spawnSync(misePath, ["which", "-C", mypacRoot, "uv"], {
		env: { ...process.env, PATH: simulatedPath },
		encoding: "utf8",
	}).stdout.trim();
	const miseUvExecutable = spawnSync("bash", ["-lc", "[ -x \"$1\" ]", "_", miseUvPath]);
	if (!miseUvPath || miseUvExecutable.status !== 0) {
		t.skip("mise cannot resolve an executable uv for this repo");
		return;
	}

	const result = spawnSync(resolve(interceptedCommandsPath, "python3"), ["--version"], {
		cwd: "/tmp",
		env: { ...process.env, PATH: `${interceptedCommandsPath}:${simulatedPath}` },
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.match(`${result.stdout}\n${result.stderr}`, /Python \d+\.\d+/);
	assert.ok(!result.stderr.includes("uv is required"), result.stderr);
});

test("python shim explains how to install uv when uv is unavailable", () => {
	const simulatedPath = pathWithoutUvOrMise();
	const systemPython = spawnSync("bash", ["-lc", "command -v python3 || command -v python || true"], {
		env: { ...process.env, PATH: simulatedPath },
		encoding: "utf8",
	}).stdout.trim();

	if (!systemPython) {
		return;
	}

	const result = spawnSync(resolve(interceptedCommandsPath, "python3"), ["--version"], {
		env: { ...process.env, PATH: `${interceptedCommandsPath}:${simulatedPath}` },
		encoding: "utf8",
	});

	assert.notEqual(result.status, 0);
	assert.ok(result.stderr.includes("uv is required"), result.stderr);
	assert.ok(result.stderr.includes("mise install uv or brew install uv"), result.stderr);
	assert.ok(result.stderr.includes("run 'pi config' and disable only the uv extension"), result.stderr);
	assert.ok(result.stderr.includes("disable all extensions for one run"), result.stderr);
	assert.ok(result.stderr.includes("--no-extensions"), result.stderr);
});
