---
description: "Review local artifacts against upstream sources and create a checkpoint when useful"
argument-hint: "[local artifact ID | upstream-ref ID | watch-source ID | all | notes]"
---

Review registered upstream sources against their local artifacts, then create a durable checkpoint issue only when useful. Follow `skills/pac-upstream-checkpoints/SKILL.md`; never implement upstream changes automatically.

The optional argument may be a local-artifact ID, upstream-ref ID, watch-source ID, `all`, or notes that identify a narrower scope. Empty means `all`.

## Behavior

1. Load and follow `skills/pac-upstream-checkpoints/SKILL.md`. Check branch safety before editing; never update `.pac/upstream-sources.yaml` on `main`.
2. Resolve the requested registry scope before loading broad registry/model context. For free-form notes, first extract an explicit stable ID; otherwise use targeted literal searches over stable registry fields to identify candidate IDs. When notes resolve uniquely, use that candidate with the targeted exact-ID extractor. When notes remain ambiguous, ask for clarification and expand only the candidate context needed to resolve them, not `all`. Never send the entire note to the exact-ID extractor or silently fail it as an unknown ID.
3. For one exact or uniquely resolved ID, run:

   ```bash
   node skills/pac-upstream-checkpoints/scripts/registry-scope.mjs .pac/upstream-sources.yaml <id>
   ```

   Use that targeted authoritative subset. Do not open the full registry merely to locate the ID.
4. For an empty or explicit all-sources scope, intentionally extract `all` and validate the full registry with `skills/pac-upstream-checkpoints/MODEL.md`. If targeted context is insufficient for a concrete required field or ambiguity, load `MODEL.md` and then expand to the full registry only as needed. Do not use fixed line ranges.
5. Fetch or refresh selected upstream sources, preferring `pac-librarian`. Inspect commit history before raw diffs, compare local-first mappings, and honor `sync_policy`, `last_reviewed`, `known_divergence`, and `do_not_chase`.
6. When scope includes a watch source, load `skills/pac-upstream-checkpoints/WATCH_INVENTORY.md` and report every uncovered path for each requested watch inventory.
7. Decide whether a checkpoint issue is needed. For a no-change run that will not publish, do not load `CHECKPOINT_ISSUE_TEMPLATE.md`; report the result with the baseline unchanged. If relevant changes, partial failures, blocked sources, or an explicit publication request require an issue, then load `skills/pac-upstream-checkpoints/CHECKPOINT_ISSUE_TEMPLATE.md` and publish one checkpoint.
8. Ask for human confirmation before creating implementation issues or advancing any `last_reviewed` baseline.
9. Summarize scope reviewed, read/context progression, findings, blocked sources, issue URL if created, and unchanged or proposed baseline state.

**Provided arguments**: $@
