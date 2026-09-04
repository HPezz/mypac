import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const coreUrl = new URL("./SKILL.md", import.meta.url);
const fixUrl = new URL("./FIX_FINDINGS.md", import.meta.url);
const standardsUrl = new URL("../pac-review-standards-spec/SKILL.md", import.meta.url);

const read = (url) => readFile(url, "utf8");

test("core review skill retains the default defect and output contracts", async () => {
	const core = await read(coreUrl);

	assert.match(core, /resolve.*target.*inspect.*diff first/is);
	assert.match(core, /introduced.*diff/i);
	assert.match(core, /discrete.*actionable/i);
	assert.match(core, /(?:prov(?:e|able).*impact|impact.*prov(?:e|ed|able))/i);
	assert.match(core, /\[P0\].*\[P1\].*\[P2\].*\[P3\]/is);
	assert.match(core, /correct.*needs attention/is);
	assert.match(core, /Human Reviewer Callouts \(Non-Blocking\)/);
	assert.match(core, /locations?.*overlap.*diff/i);
	assert.match(core, /untrusted.*input/i);
	assert.match(core, /fail-fast/i);
});

test("core review discovers GitHub PRs and GitLab MRs with provider-native context", async () => {
	const core = await read(coreUrl);

	assert.match(core, /explicit forge URLs.*provider from the URL/i);
	assert.match(core, /numeric or current-branch targets.*tracking remote.*origin.*ambiguity/i);
	assert.match(core, /gh pr view.*gh pr checkout.*gh pr diff/is);
	assert.match(core, /glab mr view.*--unresolved.*glab mr checkout.*glab mr diff/is);
	assert.match(core, /pull request for GitHub and merge request for GitLab/i);
	assert.match(core, /surface provider failures without switching CLIs/i);
});

test("core routes detailed fix guidance only for an actual fix-findings workflow", async () => {
	const core = await read(coreUrl);
	const fix = await read(fixUrl);

	assert.match(core, /actual(?:ly)? (?:entering|fixing|applying).*fix/i);
	assert.match(core, /FIX_FINDINGS\.md/);
	assert.match(core, /do not (?:read|load).*FIX_FINDINGS\.md.*read-only/i);
	assert.doesNotMatch(core, /git commit --fixup/);
	assert.doesNotMatch(core, /git blame .* -L/);
	assert.doesNotMatch(core, /rebase --autosquash/);

	assert.match(fix, /git blame .* -L/);
	assert.match(fix, /git commit --fixup/);
	assert.match(fix, /atomic/i);
	assert.match(fix, /never.*(?:automatically|without explicit approval).*autosquash/is);
	assert.match(fix, /never force push/i);
});

test("core keeps Standards + Spec an explicit follow-up", async () => {
	const core = await read(coreUrl);

	assert.match(core, /only.*explicitly asks.*Standards.*Spec/is);
	assert.match(core, /pac-review-standards-spec\/SKILL\.md/);
	assert.match(core, /do not.*Standards.*Spec.*default review/is);
});

test("Standards + Spec gathers only context applicable to a concrete question", async () => {
	const standards = await read(standardsUrl);
	const changedPaths = standards.search(/changed paths/i);
	const bestSpec = standards.search(/best available.*spec|best.*originating.*(?:spec|decision)/i);
	const question = standards.search(/concrete.*(?:standards|spec).*question/i);
	const applicable = standards.search(/applicable.*(?:paths|claims)|apply.*(?:paths|claims)/i);
	const expand = standards.search(/expand only/i);

	assert.ok(changedPaths >= 0, "follow-up should start from changed paths");
	assert.ok(bestSpec > changedPaths, "best originating spec should follow changed paths");
	assert.ok(question > bestSpec, "a concrete review question should precede context reads");
	assert.ok(applicable > question, "instruction sources should be filtered for applicability");
	assert.ok(expand > applicable, "broader reads should remain conditional");
	assert.match(standards, /do not.*(?:checklist|reflexively).*AGENTS.*CONTEXT.*README.*docs.*ADR.*config/is);
});
