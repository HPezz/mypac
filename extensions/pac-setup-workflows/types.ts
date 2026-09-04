export type LabelSpec = {
	name: string;
	color: string;
	description: string;
};

export type ForgeLabel = {
	id?: number | string;
	name: string;
	color: string;
	description?: string | null;
	scope?: "project" | "group";
};

/** Backward-compatible alias for the GitHub-only label health workflow. */
export type GitHubLabel = ForgeLabel;

export type LegacyLabelMapping = {
	legacy: string;
	target: string;
};

export type DriftField = "color" | "description";

export type DriftedLabel = {
	expected: LabelSpec;
	actual: ForgeLabel;
	fields: Partial<Record<DriftField, { expected: string; actual: string }>>;
};

export type LegacyMigrationCandidate = {
	mapping: LegacyLabelMapping;
	legacyLabel: ForgeLabel;
	expected: LabelSpec;
};

export type LegacyConflict = {
	mapping: LegacyLabelMapping;
	legacyLabel: ForgeLabel;
	targetLabel: ForgeLabel;
	expected: LabelSpec;
};

export type OwnershipConflict = {
	expected: LabelSpec;
	projectLabel: ForgeLabel;
	inheritedLabel: ForgeLabel;
};

export type LabelCheckResult = {
	required: LabelSpec[];
	present: Array<{ expected: LabelSpec; actual: ForgeLabel }>;
	missing: LabelSpec[];
	drifted: DriftedLabel[];
	migrationCandidates: LegacyMigrationCandidate[];
	conflicts: LegacyConflict[];
	inherited: ForgeLabel[];
	ownershipConflicts: OwnershipConflict[];
	hostOwned: ForgeLabel[];
	unexpectedPacLabels: ForgeLabel[];
};

export type ApplyPlan = {
	renames: LegacyMigrationCandidate[];
	creates: LabelSpec[];
	updates: DriftedLabel[];
	conflicts: LegacyConflict[];
	ownershipConflicts: OwnershipConflict[];
};

export type ParsedCommand =
	| { action: "menu"; repo?: string }
	| { action: "check"; repo?: string }
	| { action: "apply"; repo?: string }
	| { action: "help"; repo?: string }
	| { action: "error"; message: string };

export type ApplyOperationResult = {
	action: "rename" | "create" | "update";
	label: string;
	target?: string;
	success: boolean;
	message: string;
};
