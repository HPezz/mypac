#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";

function targetedRegistry(registry, { localArtifacts = [], watchSources = [] }) {
	return {
		schema_version: registry.schema_version,
		checkpoint_label: registry.checkpoint_label,
		local_artifacts: localArtifacts,
		watch_sources: watchSources,
	};
}

export function resolveRegistryScope(registryText, requestedId) {
	const registry = parse(registryText);
	const localArtifacts = registry.local_artifacts ?? [];
	const watchSources = registry.watch_sources ?? [];

	if (!requestedId || requestedId === "all") {
		return { scopeType: "all", registry };
	}

	const localArtifact = localArtifacts.find(({ id }) => id === requestedId);
	const upstreamMatches = localArtifacts.flatMap((artifact) =>
		(artifact.upstream_refs ?? [])
			.filter(({ id }) => id === requestedId)
			.map((upstreamRef) => ({ artifact, upstreamRef })),
	);
	const watchSource = watchSources.find(({ id }) => id === requestedId);
	const matchCount = Number(Boolean(localArtifact)) + upstreamMatches.length + Number(Boolean(watchSource));

	if (matchCount === 0) {
		throw new Error(`No local artifact, upstream ref, or watch source has ID "${requestedId}"`);
	}
	if (matchCount > 1) {
		throw new Error(`Registry ID "${requestedId}" is not unique`);
	}
	if (localArtifact) {
		return {
			scopeType: "local-artifact",
			registry: targetedRegistry(registry, { localArtifacts: [localArtifact] }),
		};
	}
	if (upstreamMatches.length === 1) {
		const [{ artifact, upstreamRef }] = upstreamMatches;
		return {
			scopeType: "upstream-ref",
			registry: targetedRegistry(registry, {
				localArtifacts: [{ ...artifact, upstream_refs: [upstreamRef] }],
			}),
		};
	}

	const supportingArtifacts = localArtifacts.flatMap((artifact) => {
		const matchingRefs = (artifact.upstream_refs ?? []).filter(({ repo }) => repo === watchSource.repo);
		return matchingRefs.length > 0 ? [{ ...artifact, upstream_refs: matchingRefs }] : [];
	});
	return {
		scopeType: "watch-source",
		registry: targetedRegistry(registry, {
			localArtifacts: supportingArtifacts,
			watchSources: [watchSource],
		}),
	};
}

async function main() {
	const [registryPath, requestedId] = process.argv.slice(2);
	if (!registryPath || !requestedId) {
		throw new Error("Usage: registry-scope.mjs <registry-path> <id|all>");
	}
	const result = resolveRegistryScope(await readFile(registryPath, "utf8"), requestedId);
	process.stdout.write(stringify(result.registry));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
