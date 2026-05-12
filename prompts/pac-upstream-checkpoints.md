---
description: "Review registered upstream inspiration sources and create a GitHub checkpoint issue"
argument-hint: "[source ID | all | initialize registry | notes]"
---

Review upstream/reference sources recorded for this repository and create a durable checkpoint issue.

Use `skills/pac-upstream-checkpoints/SKILL.md` for the workflow.

The optional argument after `/pac-upstream-checkpoints` may be:

- a source ID from `.pac/upstream-sources.yaml`
- `all` or empty, meaning review every registered source
- `initialize registry`, meaning create or repair `.pac/upstream-sources.yaml` before review
- free-form notes that narrow what to inspect

## Behavior

1. Load and follow `skills/pac-upstream-checkpoints/SKILL.md`.
2. Check branch safety before editing files. Do not update `.pac/upstream-sources.yaml` on `main`.
3. Read `.pac/upstream-sources.yaml` and validate the requested source scope.
4. Fetch or refresh upstream sources, preferring `pac-librarian` for GitHub repositories.
5. Compare upstream commit history and relevant local mappings.
6. Create one GitHub checkpoint issue with `<!-- pac:upstream-checkpoint -->` when relevant changes, partial failures, or blocked sources are found. For no-change runs, report the result in conversation without creating an issue unless `--include-empty` is passed.
7. Ask before creating follow-up implementation issues or advancing registry `last_reviewed` checkpoints.
8. Summarize the issue URL, sources reviewed, findings, and any blocked sources.

**Provided arguments**: $@
