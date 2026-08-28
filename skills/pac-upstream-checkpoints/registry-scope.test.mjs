import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRegistryScope } from "./scripts/registry-scope.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const registryPath = path.join(repoRoot, ".pac", "upstream-sources.yaml");
const registryText = await readFile(registryPath, "utf8");

test("named local artifact returns top-level controls and only that artifact", () => {
	const result = resolveRegistryScope(registryText, "pi-skill-github");

	assert.equal(result.scopeType, "local-artifact");
	assert.equal(result.registry.schema_version, 4);
	assert.equal(result.registry.checkpoint_label, "pac:upstream-checkpoint");
	assert.deepEqual(result.registry.local_artifacts.map(({ id }) => id), ["pi-skill-github"]);
	assert.deepEqual(result.registry.watch_sources, []);
});

test("named upstream ref returns its local mapping and only that ref", () => {
	const result = resolveRegistryScope(registryText, "agent-stuff-github-skill");

	assert.equal(result.scopeType, "upstream-ref");
	assert.deepEqual(result.registry.local_artifacts.map(({ id }) => id), ["pi-skill-github"]);
	assert.deepEqual(
		result.registry.local_artifacts[0].upstream_refs.map(({ id }) => id),
		["agent-stuff-github-skill"],
	);
	assert.deepEqual(result.registry.watch_sources, []);
});

test("named watch source returns that watch plus only same-repository refs needed for coverage", () => {
	const result = resolveRegistryScope(registryText, "mattpocock-skills-watch");

	assert.equal(result.scopeType, "watch-source");
	assert.deepEqual(result.registry.watch_sources.map(({ id }) => id), ["mattpocock-skills-watch"]);
	assert.ok(result.registry.local_artifacts.length > 0);
	assert.ok(result.registry.local_artifacts.length < resolveRegistryScope(registryText, "all").registry.local_artifacts.length);
	for (const artifact of result.registry.local_artifacts) {
		assert.ok(artifact.upstream_refs.length > 0);
		assert.ok(artifact.upstream_refs.every(({ repo }) => repo === "https://github.com/mattpocock/skills"));
	}
});

test("all returns the complete parsed registry", () => {
	const result = resolveRegistryScope(registryText, "all");

	assert.equal(result.scopeType, "all");
	assert.ok(result.registry.local_artifacts.length > 1);
	assert.ok(result.registry.watch_sources.length > 1);
});

test("unknown IDs fail without silently expanding to all sources", () => {
	assert.throws(
		() => resolveRegistryScope(registryText, "missing-scope"),
		/No local artifact, upstream ref, or watch source has ID "missing-scope"/,
	);
});
