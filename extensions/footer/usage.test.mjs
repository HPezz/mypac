import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import { getAgentAuthPath } from "./usage.ts";

test("getAgentAuthPath uses Pi's default agent directory", () => {
	const previous = process.env.PI_CODING_AGENT_DIR;
	delete process.env.PI_CODING_AGENT_DIR;
	try {
		assert.equal(getAgentAuthPath(), path.join(homedir(), ".pi", "agent", "auth.json"));
	} finally {
		if (previous !== undefined) process.env.PI_CODING_AGENT_DIR = previous;
	}
});

test("getAgentAuthPath honors Pi's overridden agent directory", () => {
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = "/tmp/custom-pi-agent";
	try {
		assert.equal(getAgentAuthPath(), "/tmp/custom-pi-agent/auth.json");
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
	}
});
