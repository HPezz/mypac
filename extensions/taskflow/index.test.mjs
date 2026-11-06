import test from "node:test";
import assert from "node:assert/strict";
import taskflowExtension from "./index.ts";

test("registers deterministic TaskFlow commands without exposing an LLM tool", () => {
	const commands = [];
	const events = [];
	let toolRegistrations = 0;
	const pi = {
		registerCommand(name, options) { commands.push([name, options.description]); },
		on(name) { events.push(name); },
		registerTool() { toolRegistrations += 1; },
	};

	taskflowExtension(pi);

	assert.deepEqual(commands.map(([name]) => name), ["task", "task-next", "task-status", "task-save", "task-move"]);
	assert.deepEqual(events, ["session_start"]);
	assert.equal(toolRegistrations, 0);
});
