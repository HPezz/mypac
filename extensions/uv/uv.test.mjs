import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBlockedCommandMessage } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const interceptedCommandsPath = resolve(__dirname, "../..", "intercepted-commands");

function pathWithoutUv() {
	const uvPaths = spawnSync("bash", ["-lc", "type -aP uv 2>/dev/null || true"], {
		encoding: "utf8",
	}).stdout.trim().split("\n").filter(Boolean);
	const uvDirs = new Set(uvPaths.map((path) => dirname(path)));

	return (process.env.PATH ?? "")
		.split(":")
		.filter((path) => path && path !== interceptedCommandsPath && !uvDirs.has(path))
		.join(":");
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

// --- unavailable uv runtime ---

test("python shim explains how to install uv when uv is unavailable", () => {
	const simulatedPath = pathWithoutUv();
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
