import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import compactVerificationOutputExtension from "./index.ts";

function registerExtension() {
	const handlers = new Map();
	compactVerificationOutputExtension({
		on(event, handler) {
			handlers.set(event, handler);
		},
	});
	return handlers.get("tool_result");
}

function bashResult({ command = "npm run check:pi-compatibility", output, isError = false }) {
	return {
		type: "tool_result",
		toolCallId: "call-1",
		toolName: "bash",
		input: { command },
		content: [{ type: "text", text: output }],
		details: undefined,
		isError,
	};
}

test("verbose successful compatibility checks become compact with retrievable full output", async () => {
	const toolResult = registerExtension();
	const output = `${"✔ routine passing test\n".repeat(500)}ℹ tests 500\nℹ pass 500\nℹ fail 0\n`;

	const result = await toolResult(bashResult({ output }), {});
	const text = result.content[0].text;

	assert.match(text, /^exit code 0$/m);
	assert.match(text, /^500 tests passed$/m);
	assert.ok(text.length < output.length / 10, "success result should be materially smaller");
	assert.match(text, /Full output: (.+)$/m);

	const fullOutputPath = text.match(/Full output: (.+)$/m)[1];
	assert.equal(await readFile(fullOutputPath, "utf8"), output);
	assert.equal(result.details.fullOutputPath, fullOutputPath);
});

test("successful checks with warning markers keep their complete diagnostics", async () => {
	const toolResult = registerExtension();
	const event = bashResult({
		output: "✔ tests passed\n(node:123) Warning: a material warning\nℹ tests 1\nℹ pass 1\nℹ fail 0\n",
	});

	assert.equal(await toolResult(event, {}), undefined);
});

test("failed checks keep their complete diagnostics", async () => {
	const toolResult = registerExtension();
	const event = bashResult({ output: "failure details\nCommand exited with code 1", isError: true });

	assert.equal(await toolResult(event, {}), undefined);
});

test("unrecognized successful commands are not compacted", async () => {
	const toolResult = registerExtension();
	const event = bashResult({ command: "npm test", output: "ℹ tests 500\nℹ pass 500\n" });

	assert.equal(await toolResult(event, {}), undefined);
});
