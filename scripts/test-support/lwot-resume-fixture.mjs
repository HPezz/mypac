export function runBlockedIssueResumeFixture({ readIssue, readBlockerState, candidateSlice }) {
	const issue = readIssue();
	const executionContract = structuredClone(issue.contract);
	const events = ["issue-contract-resolved", "execution-paused"];

	const blockerState = readBlockerState();
	events.push("blocker-state-verified", "contract-re-grounded");

	const satisfiedRequirementIds = new Set(candidateSlice.satisfiedRequirementIds);
	const omittedRequirements = executionContract.requirements.filter(
		(requirement) => !satisfiedRequirementIds.has(requirement.id),
	);
	const unrelatedAdditions = candidateSlice.changes
		.filter((change) => change.material && change.requirementId === null)
		.map((change) => change.description);
	const hasClosureDrift = omittedRequirements.length > 0 || unrelatedAdditions.length > 0;

	if (hasClosureDrift) {
		events.push("closure-drift-surfaced", "commit-preparation-blocked");
	} else {
		events.push("commit-preparation-ready");
	}

	return {
		blockerTransition: { from: issue.blocker, to: blockerState },
		executionContract,
		closure: { omittedRequirements, unrelatedAdditions },
		events,
	};
}
