import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const scenario = process.argv[2];
assert.ok(new Set(["ordinary-review", "standards-spec", "fix-findings"]).has(scenario), `unknown scenario: ${scenario}`);

const root = process.cwd();
const fixture = join(root, "evaluation-fixture");
const workspace = join(root, "evaluations", "pac-review-progressive", "workspace");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const put = async (path, content) => {
	const target = join(root, path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, content);
};
const commit = (subject) => {
	git("add", "evaluation-fixture");
	git("commit", "-q", "-m", subject);
	return git("rev-parse", "HEAD");
};

await rm(fixture, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

if (scenario === "ordinary-review") {
	await put("evaluation-fixture/parse-config.mjs", "export function parseConfig(text) {\n\treturn JSON.parse(text);\n}\n");
	commit("test fixture baseline");
	await put("evaluation-fixture/parse-config.mjs", "export function parseConfig(text) {\n\ttry {\n\t\treturn JSON.parse(text);\n\t} catch {\n\t\treturn {};\n\t}\n}\n");
	commit("introduce silent config fallback");
} else if (scenario === "standards-spec") {
	await put("evaluation-fixture/AGENTS.md", "# Fixture standards\n\nJavaScript module filenames in this directory must use kebab-case.\n");
	await put("evaluation-fixture/SPEC.md", "# Status label decision\n\nThe exported `statusLabel` value must remain `ready` for downstream display compatibility.\n");
	await put("evaluation-fixture/status-label.mjs", "export const statusLabel = \"ready\";\n");
	commit("test fixture standards baseline");
	await rm(join(fixture, "status-label.mjs"));
	await put("evaluation-fixture/statusLabel.mjs", "export const statusLabel = \"pending\";\n");
	commit("change status label");
} else {
	await put("evaluation-fixture/load-settings.mjs", "export function loadSettings(text) {\n\treturn JSON.parse(text);\n}\n");
	commit("test fixture baseline");
	await put("evaluation-fixture/load-settings.mjs", "export function loadSettings(text) {\n\ttry {\n\t\treturn JSON.parse(text);\n\t} catch {\n\t\treturn {};\n\t}\n}\n");
	const target = commit("introduce settings fallback");
	await writeFile(join(workspace, "fix-target.txt"), `${target}\n`);
}
