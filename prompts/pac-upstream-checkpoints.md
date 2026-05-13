---
description: "Review local artifacts against upstream inspiration sources and create a GitHub checkpoint issue"
argument-hint: "[local artifact ID | upstream-ref ID | watch-source ID | all | initialize registry | notes]"
---

Review local artifacts and watched upstream inventories recorded for this repository, then create a durable checkpoint issue.

Use `skills/pac-upstream-checkpoints/SKILL.md` for the workflow.

The optional argument after `/pac-upstream-checkpoints` may be:

- a local artifact ID, upstream-ref ID, or watch-source ID from `.pac/upstream-sources.yaml`
- `all` or empty, meaning review every registered local artifact and watch source
- `initialize registry`, meaning create or repair `.pac/upstream-sources.yaml` before review
- free-form notes that narrow what to inspect

## Behavior

1. Load and follow `skills/pac-upstream-checkpoints/SKILL.md`.
2. Check branch safety before editing files. Do not update `.pac/upstream-sources.yaml` on `main`.
3. Read `.pac/upstream-sources.yaml` and validate the requested scope, including `local_artifacts[].upstream_refs[]` and `watch_sources[]`.
4. Fetch or refresh upstream sources, preferring `pac-librarian` for GitHub repositories.
5. Compare upstream commit history against local mappings, using upstream-ref roles/status to avoid re-flagging known divergence; scan watch sources for newly added, moved, removed, or uncovered upstream assets.
6. Create one GitHub checkpoint issue with `<!-- pac:upstream-checkpoint -->` when relevant changes, partial failures, or blocked sources are found. For first-checkout runs, list findings as independently reviewable items. For no-change runs, report the result in conversation without creating an issue unless `--include-empty` is passed.
7. Ask before creating follow-up implementation issues or advancing registry `last_reviewed` checkpoints.
8. Summarize the issue URL, local artifacts and watch sources reviewed, findings, and any blocked sources.

**Provided arguments**: $@
