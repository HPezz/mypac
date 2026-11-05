import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskTarget, extractTaskContext, formatTaskStatus } from "./issue-format.ts";

test("parses numeric and GitLab issue/work-item task targets", () => {
	assert.deepEqual(parseTaskTarget("42"), { kind: "iid", iid: 42 });
	assert.deepEqual(parseTaskTarget("https://gitlab.com/group/sub/app/-/work_items/43"), {
		kind: "url",
		reference: {
			provider: "gitlab",
			host: "gitlab.com",
			project: "group/sub/app",
			kind: "issue",
			number: 43,
			url: "https://gitlab.com/group/sub/app/-/work_items/43",
		},
	});
	assert.equal(parseTaskTarget("https://github.com/acme/app/issues/42"), null);
	assert.equal(parseTaskTarget("0"), null);
});

test("extracts concise task context from reserved issue sections", () => {
	const description = `## Summary\n\nImplement durable task state.\n\n## Acceptance Criteria\n\n- [ ] Loads without GPT\n- [ ] Saves a checkpoint\n\n## Decisions\n\n- [Use GitLab](https://gitlab.com/group/app/-/work_items/42#note_1)\n\n## Pi TaskFlow\n\nLatest checkpoint: https://gitlab.com/group/app/-/work_items/42#note_2\n`;
	assert.deepEqual(extractTaskContext(description), {
		summary: "Implement durable task state.",
		acceptanceCriteria: "- [ ] Loads without GPT\n- [ ] Saves a checkpoint",
		decisions: "- [Use GitLab](https://gitlab.com/group/app/-/work_items/42#note_1)",
		checkpoint: "Latest checkpoint: https://gitlab.com/group/app/-/work_items/42#note_2",
	});
});

test("formats task status without adding unrelated issue history", () => {
	const text = formatTaskStatus({
		iid: 42,
		title: "Implement TaskFlow",
		state: "opened",
		labels: ["pac:ready_for_agent", "pac:afk", "State::Doing"],
		assignees: ["HPezz"],
		webUrl: "https://gitlab.com/group/app/-/work_items/42",
		updatedAt: "2026-11-05T10:00:00Z",
		description: "## Summary\n\nDo the work.",
	}, { branch: "machugo/feature/42-taskflow", commit: "abc1234" });

	assert.equal(text, [
		"#42 Implement TaskFlow",
		"State: State::Doing · opened",
		"Readiness: pac:ready_for_agent · pac:afk",
		"Assignees: HPezz",
		"Branch: machugo/feature/42-taskflow @ abc1234",
		"URL: https://gitlab.com/group/app/-/work_items/42",
	].join("\n"));
});
