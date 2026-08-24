import test from "node:test";
import assert from "node:assert/strict";
import { buildContextViewData, estimateTokens } from "./data.ts";

function createPi() {
	return {
		getCommands: () => [],
		getActiveTools: () => [],
		getAllTools: () => [],
	};
}

function createContext(cwd, systemPrompt) {
	return {
		cwd,
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
		},
		getSystemPrompt: () => systemPrompt,
		getContextUsage: () => null,
	};
}

function formatContextBlock(file) {
	return `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
}

test("reports Pi-provided context files with their prompt token attribution", async () => {
	const cwd = "/tmp/project-worktree/packages/app";
	const contextFiles = [
		{ path: "/Users/example/.pi/agent/AGENTS.override.md", content: "Global override" },
		{ path: "/tmp/project-worktree/AGENTS.md", content: "Worktree instructions" },
		{ path: "/tmp/project-worktree/packages/app/CLAUDE.MD", content: "Nested instructions" },
	];
	const systemPrompt = `Pi base\n\n<project_context>\n\n${contextFiles.map(formatContextBlock).join("")}</project_context>\n`;

	const data = await buildContextViewData(
		createPi(),
		createContext(cwd, systemPrompt),
		[],
		new Set(),
		systemPrompt,
		{ cwd, contextFiles },
	);

	assert.deepEqual(
		data.agentFiles,
		contextFiles.map((file) => ({
			path: file.path.startsWith(`${cwd}/`) ? `./${file.path.slice(cwd.length + 1)}` : file.path,
			tokens: estimateTokens(formatContextBlock(file)),
		})),
	);
});
