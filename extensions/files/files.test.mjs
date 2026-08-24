import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import filesExtension from "./index.ts";
import {
	sanitizeReference,
	stripLineSuffix,
	normalizeReferencePath,
	formatDisplayPath,
} from "./path-utils.ts";

function createFilesCommandHarness() {
	const commands = new Map();
	const shortcuts = new Map();
	const pi = {
		registerCommand(name, definition) {
			commands.set(name, definition.handler);
		},
		registerShortcut(key, definition) {
			shortcuts.set(key, definition);
		},
	};
	filesExtension(pi);
	return { commands, shortcuts };
}

// --- public registration seam ---

test("latest file reveal preserves fullscreen search shortcut", () => {
	const { shortcuts } = createFilesCommandHarness();

	assert.equal(shortcuts.get("ctrl+alt+f")?.description, "Reveal the latest file reference in Finder");
	assert.equal(shortcuts.has("ctrl+shift+f"), false);
});

test("/files reports an interactive-mode requirement through the registered command", async () => {
	const { commands } = createFilesCommandHarness();
	const notifications = [];
	const handler = commands.get("files");
	assert.equal(typeof handler, "function");

	await handler("", {
		mode: "print",
		hasUI: false,
		cwd: process.cwd(),
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
		sessionManager: { getBranch: () => [] },
	});

	assert.deepEqual(notifications, [{ message: "Files requires interactive TUI mode", level: "error" }]);
});

test("/files does not open custom TUI in RPC mode", async () => {
	const { commands } = createFilesCommandHarness();
	const notifications = [];
	const handler = commands.get("files");

	await handler("", {
		mode: "rpc",
		hasUI: true,
		cwd: process.cwd(),
		ui: {
			custom: async () => { throw new Error("custom TUI must not run in RPC mode"); },
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
		sessionManager: { getBranch: () => [] },
	});

	assert.deepEqual(notifications, [{ message: "Files requires interactive TUI mode", level: "error" }]);
});

// --- sanitizeReference ---

test("sanitizeReference strips leading quotes", () => {
	assert.equal(sanitizeReference('"hello"'), "hello");
	assert.equal(sanitizeReference("'hello'"), "hello");
});

test("sanitizeReference strips trailing punctuation", () => {
	assert.equal(sanitizeReference("/path/to/file.ts,"), "/path/to/file.ts");
	assert.equal(sanitizeReference("/path/to/file.ts."), "/path/to/file.ts");
});

test("sanitizeReference trims whitespace", () => {
	assert.equal(sanitizeReference("  /path/to/file.ts  "), "/path/to/file.ts");
});

// --- stripLineSuffix ---

test("stripLineSuffix removes #L<n> GitHub line anchors", () => {
	assert.equal(stripLineSuffix("/file.ts#L42"), "/file.ts");
});

test("stripLineSuffix removes #L<n>C<n> anchors", () => {
	assert.equal(stripLineSuffix("/file.ts#L42C10"), "/file.ts");
});

test("stripLineSuffix removes colon-based line numbers", () => {
	assert.equal(stripLineSuffix("/file.ts:42"), "/file.ts");
	assert.equal(stripLineSuffix("/file.ts:42:10"), "/file.ts");
});

test("stripLineSuffix leaves clean paths unchanged", () => {
	assert.equal(stripLineSuffix("/path/to/file.ts"), "/path/to/file.ts");
});

// --- normalizeReferencePath ---

test("normalizeReferencePath returns null for empty string", () => {
	assert.equal(normalizeReferencePath("", "/cwd"), null);
});

test("normalizeReferencePath returns null for comment-like references", () => {
	assert.equal(normalizeReferencePath("//example.com/path", "/cwd"), null);
});

test("normalizeReferencePath resolves relative paths against cwd", () => {
	const result = normalizeReferencePath("src/index.ts", "/project");
	assert.equal(result, "/project/src/index.ts");
});

test("normalizeReferencePath leaves absolute paths unchanged", () => {
	const result = normalizeReferencePath("/absolute/path/file.ts", "/cwd");
	assert.equal(result, "/absolute/path/file.ts");
});

test("normalizeReferencePath expands ~ to home directory", () => {
	const result = normalizeReferencePath("~/projects/app.ts", "/cwd");
	assert.equal(result, path.join(os.homedir(), "projects/app.ts"));
});

test("normalizeReferencePath strips line-number suffixes before resolving", () => {
	const result = normalizeReferencePath("/file.ts:10", "/cwd");
	assert.equal(result, "/file.ts");
});

test("normalizeReferencePath strips trailing slashes", () => {
	const result = normalizeReferencePath("/path/to/dir/", "/cwd");
	assert.equal(result, "/path/to/dir");
});

test("normalizeReferencePath handles file:// URLs", () => {
	const result = normalizeReferencePath("file:///usr/local/bin/node", "/cwd");
	assert.equal(result, "/usr/local/bin/node");
});

// --- formatDisplayPath ---

test("formatDisplayPath returns relative path when inside cwd", () => {
	const result = formatDisplayPath("/project/src/index.ts", "/project");
	assert.equal(result, "src/index.ts");
});

test("formatDisplayPath returns absolute path when outside cwd", () => {
	const result = formatDisplayPath("/other/path/file.ts", "/project");
	assert.equal(result, "/other/path/file.ts");
});

test("formatDisplayPath handles exact cwd match by returning absolute", () => {
	// The cwd itself, not a child — should return absolute
	const result = formatDisplayPath("/project", "/project");
	assert.equal(result, "/project");
});
