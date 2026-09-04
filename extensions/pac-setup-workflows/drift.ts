import { HOST_OWNED_LABELS, LEGACY_LABEL_MAPPINGS, REQUIRED_PAC_LABELS } from "./config.ts";
import type { ApplyPlan, ForgeLabel, LabelCheckResult, LabelSpec } from "./types.ts";

export function normalizeColor(color: string): string {
	return color.trim().replace(/^#/, "").toUpperCase();
}

function normalizeDescription(description: string | null | undefined): string {
	return description ?? "";
}

function labelKey(name: string): string {
	return name.toLowerCase();
}

function labelsByName(labels: ForgeLabel[]): Map<string, ForgeLabel[]> {
	const grouped = new Map<string, ForgeLabel[]>();
	for (const label of labels) {
		const key = labelKey(label.name);
		grouped.set(key, [...(grouped.get(key) ?? []), label]);
	}
	return grouped;
}

function projectLabel(labels: ForgeLabel[] | undefined): ForgeLabel | undefined {
	return labels?.find((label) => label.scope !== "group");
}

function inheritedLabel(labels: ForgeLabel[] | undefined): ForgeLabel | undefined {
	return labels?.find((label) => label.scope === "group");
}

function findRequired(name: string): LabelSpec | undefined {
	return REQUIRED_PAC_LABELS.find((label) => label.name === name);
}

export function analyzeLabels(labels: ForgeLabel[]): LabelCheckResult {
	const byName = labelsByName(labels);
	const present: LabelCheckResult["present"] = [];
	const missing: LabelSpec[] = [];
	const drifted: LabelCheckResult["drifted"] = [];
	const ownershipConflicts: LabelCheckResult["ownershipConflicts"] = [];

	for (const expected of REQUIRED_PAC_LABELS) {
		const matches = byName.get(labelKey(expected.name));
		const project = projectLabel(matches);
		const inherited = inheritedLabel(matches);
		const actual = project ?? inherited;
		if (!actual) {
			missing.push(expected);
			continue;
		}

		present.push({ expected, actual });
		if (project && inherited) {
			ownershipConflicts.push({ expected, projectLabel: project, inheritedLabel: inherited });
			continue;
		}

		// Inherited labels satisfy the requirement but are read-only at project scope.
		if (!project) continue;

		const fields: LabelCheckResult["drifted"][number]["fields"] = {};
		const actualColor = normalizeColor(project.color);
		const expectedColor = normalizeColor(expected.color);
		if (actualColor !== expectedColor) fields.color = { expected: expectedColor, actual: actualColor };

		const actualDescription = normalizeDescription(project.description);
		if (actualDescription !== expected.description) {
			fields.description = { expected: expected.description, actual: actualDescription };
		}

		if (Object.keys(fields).length > 0) drifted.push({ expected, actual: project, fields });
	}

	const migrationCandidates: LabelCheckResult["migrationCandidates"] = [];
	const conflicts: LabelCheckResult["conflicts"] = [];

	for (const mapping of LEGACY_LABEL_MAPPINGS) {
		const legacyLabel = projectLabel(byName.get(labelKey(mapping.legacy)));
		if (!legacyLabel) continue;

		const targetLabel = projectLabel(byName.get(labelKey(mapping.target))) ?? inheritedLabel(byName.get(labelKey(mapping.target)));
		const expected = findRequired(mapping.target);
		if (!expected) continue;

		if (targetLabel) conflicts.push({ mapping, legacyLabel, targetLabel, expected });
		else migrationCandidates.push({ mapping, legacyLabel, expected });
	}

	const requiredNames = new Set(REQUIRED_PAC_LABELS.map((label) => labelKey(label.name)));
	const inherited = labels.filter((label) => label.scope === "group");
	const hostOwned = labels.filter((label) => HOST_OWNED_LABELS.has(labelKey(label.name)));
	const unexpectedPacLabels = labels.filter((label) => labelKey(label.name).startsWith("pac:") && !requiredNames.has(labelKey(label.name)));

	return {
		required: REQUIRED_PAC_LABELS,
		present,
		missing,
		drifted,
		migrationCandidates,
		conflicts,
		inherited,
		ownershipConflicts,
		hostOwned,
		unexpectedPacLabels,
	};
}

export function buildApplyPlan(result: LabelCheckResult): ApplyPlan {
	const renameTargets = new Set(result.migrationCandidates.map((candidate) => candidate.mapping.target));
	const ownershipConflictNames = new Set(result.ownershipConflicts.map((conflict) => conflict.expected.name));

	return {
		renames: result.migrationCandidates,
		creates: result.missing.filter((label) => !renameTargets.has(label.name)),
		updates: result.drifted.filter((drift) => !ownershipConflictNames.has(drift.expected.name)),
		conflicts: result.conflicts,
		ownershipConflicts: result.ownershipConflicts,
	};
}

export function countPlannedChanges(plan: ApplyPlan): number {
	return plan.renames.length + plan.creates.length + plan.updates.length;
}

export function hasCleanRequiredLabels(result: LabelCheckResult): boolean {
	return result.missing.length === 0
		&& result.drifted.length === 0
		&& result.migrationCandidates.length === 0
		&& result.conflicts.length === 0
		&& result.ownershipConflicts.length === 0;
}
