import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readTaskPointer, writeTaskPointer } from "./state.ts";

test("persists only the active task pointer outside the repository", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "taskflow-state-"));
	const cwd = "/workspace/picto-api";
	const pointer = {
		repository: { provider: "gitlab", host: "gitlab.com", project: "picto-access/picto-api" },
		iid: 42,
		webUrl: "https://gitlab.com/picto-access/picto-api/-/work_items/42",
		selectedAt: "2026-11-05T10:00:00Z",
	};

	await writeTaskPointer(cwd, pointer, { PI_CODING_AGENT_DIR: root });
	assert.deepEqual(await readTaskPointer(cwd, { PI_CODING_AGENT_DIR: root }), pointer);
	assert.equal(await readTaskPointer("/workspace/other", { PI_CODING_AGENT_DIR: root }), null);

	const files = await fs.readdir(path.join(root, "taskflow", "active"));
	assert.equal(files.length, 1);
	const stored = JSON.parse(await fs.readFile(path.join(root, "taskflow", "active", files[0]), "utf8"));
	assert.deepEqual(Object.keys(stored).sort(), ["cwd", "pointer"]);
});
