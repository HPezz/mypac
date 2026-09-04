---
name: pac-upstream-checkpoints
description: "Review upstream/reference sources against this repository and create checkpoint issues on its resolved forge. Use when checking .pac/upstream-sources.yaml, tracking inspiration drift, or running /pac-upstream-checkpoints."
license: MIT
compatibility: Git repository; gh or glab CLI recommended; network access required for remote sources.
metadata:
  author: mypac
  stage: shared
---

# Upstream inspiration checkpoints

Review sources registered in `.pac/upstream-sources.yaml` against the exact local artifacts they inform. Do not implement upstream changes from this workflow. Keep suggestions separate from decisions, and require human confirmation before creating implementation issues or advancing a checkpoint baseline.

## Core contract

- Work local-first from each selected `local.paths` mapping; never treat broad artifact groups as review units.
- Honor every selected ref or watch source's `sync_policy`:
  - `provenance_only`: verify attribution unless comparison was explicitly requested.
  - `targeted`: seek transferable improvements, not feature parity.
  - `inventory_watch`: inventory additions, moves, removals, and uncovered assets.
- Treat `last_reviewed.upstream_commit` as the accepted comparison baseline. A null value means `initial-baseline`.
- Walk upstream commit history before using a raw file diff.
- Apply `known_divergence` and `do_not_chase` so settled differences are not repeatedly proposed.
- Keep `last_reviewed` pointer-only. Decisions belong in checkpoint issues.

## Workflow

### 1. Confirm repository context

```bash
git rev-parse --show-toplevel
git branch --show-current
```

Resolve the destination forge by explicit repository context, then the current tracking remote, then `origin`. Use `gh repo view` for GitHub or `glab repo view` for GitLab, preserving configured self-hosted hosts and nested namespaces. If the matching CLI is unavailable or unauthenticated, continue with local comparison where possible and report that publication needs forge access. Never update `.pac/upstream-sources.yaml` on the default branch.

### 2. Resolve the requested registry scope progressively

Classify an explicit argument as one local-artifact ID, upstream-ref ID, watch-source ID, `all`, or free-form notes. Empty scope means `all`.

For free-form notes, resolve scope progressively before extraction:

1. Extract any explicit stable ID named in the notes.
2. Otherwise use targeted literal searches over stable registry fields such as `id`, `title`, `local.paths`, `repo`, `paths`, and `purpose` to identify candidate IDs without opening the full registry in model context.
3. If exactly one candidate fits the notes, use its stable ID with the exact-ID extractor below.
4. For zero or multiple candidates, expand only enough candidate entries or `MODEL.md` context to answer the concrete unresolved scope question. Ask for clarification when intent remains ambiguous; do not silently broaden to `all`.

Never treat unresolved free-form notes as `all`, never fail them merely because they are not an exact ID, and never pass the entire note to the exact-ID extractor.

For an exact named ID, or the unique candidate resolved from notes, use the stable key-based extractor:

```bash
node skills/pac-upstream-checkpoints/scripts/registry-scope.mjs .pac/upstream-sources.yaml <id>
```

The targeted result includes `schema_version`, `checkpoint_label`, and only the authoritative entries needed for that operation. A watch-source result also includes registered refs from the same repository because exhaustive coverage comparison needs them.

For `all`, intentionally parse the full registry:

```bash
node skills/pac-upstream-checkpoints/scripts/registry-scope.mjs .pac/upstream-sources.yaml all
```

Load `MODEL.md` when running `all`, or when targeted context is insufficient to validate a missing/ambiguous field. Only then expand to the full registry if the targeted result cannot answer a concrete required question. Do not use fixed line ranges or semantic/vector indexing.

Validate only the resolved scope. Report the exact artifact/ref/source ID for any required missing field, and continue only when that field is not needed for the requested operation.

Scope semantics:

- Local-artifact ID: review that artifact and all its upstream refs.
- Upstream-ref ID: review only that ref and its parent local mapping.
- Watch-source ID: run only that watch inventory; load `WATCH_INVENTORY.md` before inventory analysis.
- `all`: review every local artifact and watch source; load `WATCH_INVENTORY.md` before the watch phase.

### 3. Fetch or refresh upstream repositories

Use `pac-librarian` for remote git repositories from GitHub, GitLab, or other hosts so the host-neutral checkout cache is reused:

```bash
bash skills/pac-librarian/checkout.sh <repo-url-or-owner/repo> --path-only
git -C <checkout> fetch --unshallow 2>/dev/null || true
git -C <checkout> fetch --all --prune
current_head="$(git -C <checkout> rev-parse "origin/<ref>" 2>/dev/null || git -C <checkout> rev-parse "<ref>")"
```

Prefer `origin/<ref>` for branches; use `<ref>` for tags, commit SHAs, or non-branch refs. Record fetch or resolution failures as blocked findings.

### 4. Inspect history, then compare

For a previously reviewed source, inspect history before the raw diff:

```bash
git -C <checkout> log --oneline --decorate <last_reviewed_commit>..<current_head> -- <source paths...>
git -C <checkout> diff --stat <last_reviewed_commit>..<current_head> -- <source paths...>
```

For an initial baseline, inspect current files and enough recent history to understand the relationship without claiming a complete historical review. Pull linked upstream issues and pull/merge requests only when commit evidence leaves important rationale unclear.

Then inspect mapped `local.paths` and report relevant differences, ideas already present, exclusions from `known_divergence` or `do_not_chase`, and possible follow-up areas. Suggested statuses are `adopt`, `ignore`, `defer`, `investigate`, or `intentional divergence`.

For a watch scope, follow `WATCH_INVENTORY.md`; requested watch inventories must remain exhaustive.

### 5. Decide whether publication is useful

A checkpoint issue is needed when relevant changes, partial failures, or blocked sources were found, or when the user explicitly requests an issue. A no-change run normally ends in conversation with the baseline unchanged.

Only after deciding a checkpoint issue is needed, load `CHECKPOINT_ISSUE_TEMPLATE.md` and follow its provider-specific label and publication procedure. Relevant findings and partial failures produce exactly one checkpoint issue on the current forge. Do not load that template for a no-change run that will not publish.

### 6. Protect checkpoint baselines

Do not advance `.pac/upstream-sources.yaml` automatically. After publication, ask whether the human accepts the `Next checkpoint data`. Update `last_reviewed` only after explicit human confirmation of baseline advancement.

Store the issue URL returned by either provider verbatim in `checkpoint_issue`; do not reconstruct it from provider-specific assumptions.

If a corrected checkpoint supersedes an earlier one, comment on both issues, close the stale checkpoint, and use only the accepted latest checkpoint data. Never create follow-up implementation issues without human confirmation.

## Examples

```text
/pac-upstream-checkpoints pi-skill-github
/pac-upstream-checkpoints agent-stuff-github-skill
/pac-upstream-checkpoints mattpocock-skills-watch
/pac-upstream-checkpoints all
```
