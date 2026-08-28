import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scenario = process.argv[2];
const allowed = new Set(["cheap-override", "ready-for-agent-bug", "out-of-scope"]);
assert.ok(allowed.has(scenario), `unknown scenario: ${scenario}`);

const report = await readFile(
	new URL(`./workspace/${scenario}.md`, import.meta.url),
	"utf8",
);

assert.match(report, /evidence/i);

if (scenario === "cheap-override") {
	assert.match(report, /pac:ready_for_human/i);
	assert.match(report, /pac:needs_triage/i);
} else if (scenario === "ready-for-agent-bug") {
	assert.match(report, /reproduc/i);
	assert.match(report, /is-even\.mjs/i);
	assert.match(report, /fail/i);
} else {
	assert.match(report, /pac:out_of_scope/i);
	assert.match(report, /hosted service operation/i);
}
