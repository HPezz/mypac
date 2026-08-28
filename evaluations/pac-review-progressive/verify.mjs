import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const scenario = process.argv[2];
assert.ok(new Set(["ordinary-review", "standards-spec", "fix-findings"]).has(scenario), `unknown scenario: ${scenario}`);

const report = await readFile(new URL(`./workspace/${scenario}.md`, import.meta.url), "utf8");
assert.match(report, /## Read progression/i);

if (scenario === "ordinary-review") {
	assert.match(report, /\[P[0-3]\].*parse-config\.mjs/is);
	assert.match(report, /(?:silent|hide|swallow|fallback).*failure/is);
	assert.match(report, /Human Reviewer Callouts \(Non-Blocking\)/);
	assert.doesNotMatch(report, /FIX_FINDINGS\.md|pac-review-standards-spec|## Standards Findings|## Spec Findings/i);
} else if (scenario === "standards-spec") {
	assert.match(report, /## Standards Findings/i);
	assert.match(report, /statusLabel\.mjs.*kebab-case|kebab-case.*statusLabel\.mjs/is);
	assert.match(report, /## Spec Findings/i);
	assert.match(report, /pending.*ready|ready.*pending/is);
	assert.match(report, /AGENTS\.md/);
	assert.match(report, /SPEC\.md/);
	assert.doesNotMatch(report, /FIX_FINDINGS\.md/i);
} else {
	const target = (await readFile(new URL("./workspace/fix-target.txt", import.meta.url), "utf8")).trim();
	const log = execFileSync("git", ["log", "--format=%H%x09%s", "--", "evaluation-fixture/load-settings.mjs"], { encoding: "utf8" });
	assert.match(log, new RegExp(`fixup! introduce settings fallback`));
	const fixup = log.trim().split("\n")[0].split("\t")[0];
	const parents = execFileSync("git", ["rev-list", "--parents", "-n", "1", fixup], { encoding: "utf8" }).trim().split(" ");
	assert.equal(parents.length, 2, "fixup should be an ordinary commit, not rewritten history");
	assert.match(report, /FIX_FINDINGS\.md/i);
	assert.match(report, new RegExp(target.slice(0, 7), "i"));
	assert.match(report, /git blame/i);
	assert.match(await readFile("evaluation-fixture/load-settings.mjs", "utf8"), /return JSON\.parse\(text\);/);
	assert.doesNotMatch(await readFile("evaluation-fixture/load-settings.mjs", "utf8"), /catch/);
}
