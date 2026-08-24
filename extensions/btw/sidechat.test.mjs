import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	BTW_IMPORT_TYPE,
	BTW_SIDECHAT_STATE_TYPE,
	getBtwSidechatLocation,
	getImportOverlayHint,
	isImportOverlayCommand,
	isPartialImportOverlayCommand,
	resolveImportTarget,
	restorePersistedState,
} from "./sidechat.ts";
import { synchronizeModelRuntime } from "./model-runtime.ts";

const require = createRequire(import.meta.url);

// Resolve pi-coding-agent: prefer local node_modules (devDependencies) so
// `npm test` works without a global pi install; fall back to the global pi
// prefix structure for environments where `npm install` has not been run.
const localAgentDir = fileURLToPath(new URL("../../node_modules/@earendil-works/pi-coding-agent", import.meta.url));
const piAgentDir = existsSync(localAgentDir)
	? localAgentDir
	: path.join(
			path.resolve(path.dirname(execFileSync("which", ["pi"], { encoding: "utf8" }).trim()), ".."),
			"lib",
			"node_modules",
			"@earendil-works",
			"pi-coding-agent",
		);

const { SessionManager } = require(path.join(piAgentDir, "dist", "index.js"));
const extensionPath = path.resolve("extensions/btw/index.ts");
const localPiBin = fileURLToPath(new URL("../../node_modules/.bin/pi", import.meta.url));
const piCommand = existsSync(localPiBin) ? localPiBin : "pi";

function makeWorkspace(t) {
	const root = mkdtempSync(path.join(tmpdir(), "btw-sidechat-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const projectDir = path.join(root, "project");
	const sessionDir = path.join(root, "sessions");
	const agentDir = path.join(root, "agent");
	mkdirSync(projectDir, { recursive: true });
	mkdirSync(sessionDir, { recursive: true });
	mkdirSync(agentDir, { recursive: true });
	return { root, projectDir, sessionDir, agentDir };
}

function rewriteSession(manager) {
	manager._rewriteFile();
}

function createMainSession({ projectDir, sessionDir }, legacyEntries = []) {
	const file = path.join(sessionDir, `main-${Math.random().toString(16).slice(2)}.jsonl`);
	const manager = SessionManager.open(file, sessionDir, projectDir);
	for (const entry of legacyEntries) {
		manager.appendCustomEntry(entry.customType, entry.data);
	}
	rewriteSession(manager);
	return {
		file,
		sessionId: manager.getSessionId(),
	};
}

function readJsonl(file) {
	return readFileSync(file, "utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function assertNoBtwMainSessionEntries(file, beforeText) {
	const before = beforeText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
	const after = readJsonl(file);
	assert.deepEqual(after.slice(0, before.length), before);
	assert.ok(after.slice(before.length).every((entry) => entry.type === "thinking_level_change"));
}

function runBtw({ projectDir, sessionDir, agentDir }, sessionFile) {
	execFileSync(
		piCommand,
		[
			"--offline",
			"--no-extensions",
			"-e",
			extensionPath,
			"--no-context-files",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--session-dir",
			sessionDir,
			"--session",
			sessionFile,
			"-p",
			"/btw",
		],
		{
			cwd: projectDir,
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: agentDir,
			},
			stdio: "pipe",
		},
	);
}

test("synchronizeModelRuntime mirrors registrations, removals, and runtime-only auth", async () => {
	const nativeProvider = { id: "native-provider" };
	const config = { baseUrl: "https://proxy.example" };
	const source = {
		getRegisteredProviderIds: () => ["native-provider", "configured-provider"],
		getRegisteredNativeProvider: (id) => id === "native-provider" ? nativeProvider : undefined,
		getRegisteredProviderConfig: (id) => id === "configured-provider" ? config : undefined,
		getProviderAuth: async (id) => id === "configured-provider"
			? { auth: { apiKey: "runtime-key" }, source: "runtime" }
			: undefined,
	};
	const events = [];
	const target = {
		getRegisteredProviderIds: () => ["stale-provider"],
		unregisterProvider: (id) => events.push(["unregister", id]),
		registerNativeProvider: (provider) => events.push(["native", provider]),
		registerProvider: (id, providerConfig) => events.push(["config", id, providerConfig]),
		refresh: async (options) => events.push(["refresh", options]),
		getAuth: async () => undefined,
		setRuntimeApiKey: async (id, key) => events.push(["auth", id, key]),
	};

	await synchronizeModelRuntime(source, target, "configured-provider");

	assert.deepEqual(events, [
		["unregister", "stale-provider"],
		["unregister", "native-provider"],
		["native", nativeProvider],
		["unregister", "configured-provider"],
		["config", "configured-provider", config],
		["refresh", { providers: ["stale-provider", "native-provider", "configured-provider"], allowNetwork: false }],
		["auth", "configured-provider", "runtime-key"],
	]);
});

test("synchronizeModelRuntime updates and removes mirrored runtime-only authentication", async () => {
	let sourceKey = "first-key";
	let targetKey;
	const events = [];
	const source = {
		getRegisteredProviderIds: () => [],
		getRegisteredNativeProvider: () => undefined,
		getRegisteredProviderConfig: () => undefined,
		getProviderAuth: async () => sourceKey ? { auth: { apiKey: sourceKey }, source: "runtime" } : undefined,
	};
	const target = {
		getRegisteredProviderIds: () => [],
		unregisterProvider() {},
		registerNativeProvider() {},
		registerProvider() {},
		refresh: async () => {},
		getAuth: async () => targetKey ? { auth: { apiKey: targetKey }, source: "runtime" } : undefined,
		setRuntimeApiKey: async (_id, key) => { targetKey = key; events.push(["set", key]); },
		removeRuntimeApiKey: async () => { targetKey = undefined; events.push(["remove"]); },
	};

	await synchronizeModelRuntime(source, target, "configured-provider");
	sourceKey = "second-key";
	await synchronizeModelRuntime(source, target, "configured-provider");
	sourceKey = undefined;
	await synchronizeModelRuntime(source, target, "configured-provider");

	assert.deepEqual(events, [["set", "first-key"], ["set", "second-key"], ["remove"]]);
});

test("synchronizeModelRuntime preserves child authentication resolved from shared storage", async () => {
	let mirrored = false;
	const source = {
		getRegisteredProviderIds: () => [],
		getRegisteredNativeProvider: () => undefined,
		getRegisteredProviderConfig: () => undefined,
		getProviderAuth: async () => ({ auth: { apiKey: "source-key" }, source: "runtime" }),
	};
	const target = {
		getRegisteredProviderIds: () => [],
		unregisterProvider() {},
		registerNativeProvider() {},
		registerProvider() {},
		refresh: async () => {},
		getAuth: async () => ({ auth: { apiKey: "stored-key" }, source: "stored" }),
		setRuntimeApiKey: async () => { mirrored = true; },
	};

	await synchronizeModelRuntime(source, target, "configured-provider");
	assert.equal(mirrored, false);
});

test("helper logic keeps sidechats hidden and import resolution anchored", () => {
	const location = getBtwSidechatLocation("/tmp/sessions", "main-session-id");
	assert.equal(location.dir, "/tmp/sessions/.btw-sidechats/main-session-id");
	assert.equal(location.file, "/tmp/sessions/.btw-sidechats/main-session-id/default.jsonl");

	assert.deepEqual(resolveImportTarget({ leafId: "launch-leaf", timestamp: 1 }, "current-leaf", false), {
		source: "launch",
		leafId: "launch-leaf",
	});
	assert.deepEqual(resolveImportTarget({ leafId: "launch-leaf", timestamp: 1 }, "current-leaf", true), {
		source: "refresh",
		leafId: "current-leaf",
	});
	assert.equal(isImportOverlayCommand("/import"), true);
	assert.equal(isImportOverlayCommand("  /import  "), true);
	assert.equal(isImportOverlayCommand("/import please"), false);
	assert.equal(isPartialImportOverlayCommand("/import please"), true);
	assert.equal(isPartialImportOverlayCommand("/import "), false);
	assert.equal(isPartialImportOverlayCommand("/import"), false);
	assert.equal(isPartialImportOverlayCommand("hello /import"), false);
	assert.equal(getImportOverlayHint(false), "/import main context");
	assert.equal(getImportOverlayHint(true), "/import main context");

	const restored = restorePersistedState(
		[
			{ type: "custom", customType: "btw-thread-entry", data: { question: "old", answer: "ignore" } },
			{ type: "custom", customType: "btw-thread-reset", data: { timestamp: 1 } },
			{ type: "custom", customType: BTW_IMPORT_TYPE, data: { messages: [{ role: "user" }], timestamp: 2, messageCount: 1 } },
			{ type: "custom", customType: "btw-thread-entry", data: { question: "new", answer: "keep" } },
			{ type: "custom", customType: BTW_SIDECHAT_STATE_TYPE, data: { version: 1, mainSessionId: "abc" } },
		],
		{
			entryType: "btw-thread-entry",
			resetType: "btw-thread-reset",
			importType: BTW_IMPORT_TYPE,
			stateType: BTW_SIDECHAT_STATE_TYPE,
		},
	);

	assert.deepEqual(restored.thread, [{ question: "new", answer: "keep" }]);
	assert.deepEqual(restored.importedContext, { messages: [{ role: "user" }], timestamp: 2, messageCount: 1 });
	assert.equal(restored.state?.mainSessionId, "abc");
});

test("/btw writes metadata only to the hidden sidechat", (t) => {
	const workspace = makeWorkspace(t);
	const mainSession = createMainSession(workspace);
	const before = readFileSync(mainSession.file, "utf8");

	runBtw(workspace, mainSession.file);

	const sidechat = getBtwSidechatLocation(workspace.sessionDir, mainSession.sessionId).file;
	assert.ok(existsSync(sidechat), "expected hidden sidechat file");
	const entries = readJsonl(sidechat);
	assert.equal(entries[0].parentSession, mainSession.file);
	assert.ok(entries.some((entry) => entry.customType === BTW_SIDECHAT_STATE_TYPE));
	assert.ok(entries.some((entry) => entry.customType === "btw-thread-reset"));
	assert.ok(entries.some((entry) => entry.customType === BTW_SIDECHAT_STATE_TYPE && entry.data.anchor));
	assertNoBtwMainSessionEntries(mainSession.file, before);
});

test("legacy inline BTW entries are ignored on first restore", (t) => {
	const workspace = makeWorkspace(t);
	const legacyImport = {
		messages: [{ role: "user", content: [{ type: "text", text: "snapshot" }], timestamp: 1 }],
		timestamp: 1,
		messageCount: 1,
	};
	const mainSession = createMainSession(workspace, [
		{ customType: "btw-thread-entry", data: { question: "legacy question", answer: "legacy answer" } },
		{ customType: BTW_IMPORT_TYPE, data: legacyImport },
	]);
	const before = readFileSync(mainSession.file, "utf8");

	runBtw(workspace, mainSession.file);

	const sidechat = getBtwSidechatLocation(workspace.sessionDir, mainSession.sessionId).file;
	const entries = readJsonl(sidechat);
	assert.ok(!entries.some((entry) => entry.customType === "btw-thread-entry"));
	assert.ok(!entries.some((entry) => entry.customType === BTW_IMPORT_TYPE));
	assertNoBtwMainSessionEntries(mainSession.file, before);
});

test("sidechats are reused per main session id and isolated between sessions", (t) => {
	const workspace = makeWorkspace(t);
	const sessionA = createMainSession(workspace);
	const sessionB = createMainSession(workspace);

	runBtw(workspace, sessionA.file);
	runBtw(workspace, sessionA.file);
	runBtw(workspace, sessionB.file);

	const sidechatA = getBtwSidechatLocation(workspace.sessionDir, sessionA.sessionId).file;
	const sidechatB = getBtwSidechatLocation(workspace.sessionDir, sessionB.sessionId).file;
	assert.ok(existsSync(sidechatA));
	assert.ok(existsSync(sidechatB));
	assert.notEqual(sidechatA, sidechatB);
});
