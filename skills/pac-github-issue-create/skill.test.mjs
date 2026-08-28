import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const coreUrl = new URL("./SKILL.md", import.meta.url);
const linkingUrl = new URL("./LINKING.md", import.meta.url);

async function readGuidance(url) {
	return readFile(url, "utf8");
}

test("standalone issue creation needs only the core guidance", async () => {
	const core = await readGuidance(coreUrl);

	assert.match(core, /git rev-parse --is-inside-work-tree/);
	assert.match(core, /gh repo view --json nameWithOwner/);
	assert.match(core, /concise title/i);
	assert.match(core, /structured issue body/i);
	assert.match(core, /most one pac workflow state label/i);
	assert.match(core, /gh label list/);
	assert.match(core, /gh issue create/);
	assert.match(core, /Return the created issue URL/i);
	assert.match(core, /Surface `gh` errors clearly/i);

	assert.doesNotMatch(core, /addSubIssue/);
	assert.doesNotMatch(core, /addBlockedBy/);
	assert.doesNotMatch(core, /node IDs/i);
});

test("core loads linking guidance only when relationships are requested", async () => {
	const core = await readGuidance(coreUrl);

	assert.match(core, /parent|sub-issue|blocked by|blocks/i);
	assert.match(core, /LINKING\.md/);
	assert.match(core, /only when|only if/i);
	assert.match(core, /Do not (?:read|load) `LINKING\.md`.*standalone/i);
});

test("linking guidance preserves relationship directionality and errors", async () => {
	const linking = await readGuidance(linkingUrl);

	assert.match(linking, /--json id --jq \.id/);
	assert.match(linking, /addSubIssue/);
	assert.match(linking, /issueId.*parent issue/i);
	assert.match(linking, /subIssueId.*child issue/i);
	assert.match(linking, /addBlockedBy/);
	assert.match(linking, /new issue.*blocked by[\s\S]*issueId.*new issue[\s\S]*blockingIssueId/i);
	assert.match(linking, /new issue.*blocks[\s\S]*issueId[\s\S]*blockingIssueId.*new issue/i);
	assert.match(linking, /Surface GraphQL errors clearly/i);
});
