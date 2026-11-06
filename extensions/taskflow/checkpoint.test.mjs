import test from "node:test";
import assert from "node:assert/strict";
import {
	buildCheckpointTemplate,
	buildTaskflowDescription,
	extractLatestCheckpointNoteId,
	fetchLatestCheckpoint,
	formatCheckpointStatus,
} from "./checkpoint.ts";

const repository = { provider: "gitlab", host: "gitlab.com", project: "picto-access/picto-api" };

test("builds a deterministic checkpoint template with local git references", () => {
	assert.equal(buildCheckpointTemplate({ branch: "machugo/feature/taskflow", commit: "abc1234" }), `<!-- pi-taskflow:checkpoint:v1 -->

## Checkpoint

### Completed
-

### Decisions
-

### Remaining
-

### Blockers
-

### Next action
-

### References
- Branch: machugo/feature/taskflow
- Commit: abc1234
- Merge request:
`);
});

test("replaces only the reserved Pi TaskFlow description block", () => {
	const original = `## Summary\n\nKeep this.\n\n<!-- pi-taskflow:start -->\n## Pi TaskFlow\n\nOld pointer\n<!-- pi-taskflow:end -->\n\n## Notes\n\nAlso keep this.`;
	assert.equal(
		buildTaskflowDescription(original, "https://gitlab.com/group/app/-/work_items/42#note_99", "2026-11-05T10:00:00Z"),
		`## Summary\n\nKeep this.\n\n<!-- pi-taskflow:start -->\n## Pi TaskFlow\n\n- Latest checkpoint: https://gitlab.com/group/app/-/work_items/42#note_99\n- Saved at: 2026-11-05T10:00:00Z\n<!-- pi-taskflow:end -->\n\n## Notes\n\nAlso keep this.`,
	);
});

test("formats the checkpoint pointer and precise next action", () => {
	assert.equal(formatCheckpointStatus(
		"<!-- pi-taskflow:start -->\n## Pi TaskFlow\n\n- Latest checkpoint: https://gitlab.com/group/app/-/work_items/42#note_99\n<!-- pi-taskflow:end -->",
		"## Checkpoint\n\n### Completed\nTests added\n\n### Next action\nRun the integration test",
	), "Checkpoint: https://gitlab.com/group/app/-/work_items/42#note_99\nNext action: Run the integration test");
});

test("retrieves only the checkpoint note referenced by the issue body", async () => {
	const issue = {
		iid: 42, title: "Task", state: "opened", labels: [], assignees: [], updatedAt: "", webUrl: "https://gitlab.com/picto-access/picto-api/-/work_items/42",
		description: "<!-- pi-taskflow:start -->\n## Pi TaskFlow\n\n- Latest checkpoint: https://gitlab.com/picto-access/picto-api/-/work_items/42#note_99\n<!-- pi-taskflow:end -->",
	};
	assert.equal(extractLatestCheckpointNoteId(issue.description), 99);
	const calls = [];
	const pi = { async exec(command, args) {
		calls.push([command, args]);
		return { code: 0, stderr: "", stdout: JSON.stringify({ id: 99, body: "<!-- pi-taskflow:checkpoint:v1 -->\n\n## Checkpoint\n\n### Next action\nRun tests" }) };
	} };
	assert.deepEqual(await fetchLatestCheckpoint(pi, repository, issue), { ok: true, value: "<!-- pi-taskflow:checkpoint:v1 -->\n\n## Checkpoint\n\n### Next action\nRun tests" });
	assert.deepEqual(calls[0], ["glab", ["api", "--hostname", "gitlab.com", "projects/picto-access%2Fpicto-api/issues/42/notes/99"]]);
});
