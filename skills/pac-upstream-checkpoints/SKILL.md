---
name: pac-upstream-checkpoints
description: "Review upstream/reference sources against this repository and create GitHub checkpoint issues. Use when checking .pac/upstream-sources.yaml, tracking inspiration drift, or running /pac-upstream-checkpoints."
license: MIT
compatibility: Git repository; gh CLI recommended; network access required for remote sources.
metadata:
  author: mypac
  stage: shared
---

# Upstream inspiration checkpoints

Use this skill to review external sources recorded in `.pac/upstream-sources.yaml`, compare their changes with `mypac`, and create a durable GitHub checkpoint issue.

## Goal

Produce an auditable review artifact that answers:

- what upstream sources were checked,
- what commit ranges or refs were reviewed,
- what relevant changes or non-changes were found,
- which local files or workflows may be affected,
- what follow-up decisions are suggested,
- where the next run should resume.

Do not implement upstream changes from this workflow. Suggest follow-up areas and ask for human confirmation before creating implementation issues or advancing registry baselines.

## Registry contract

The registry lives at `.pac/upstream-sources.yaml`.

The registry is local-first. Start from the artifact we maintain, then list the upstream refs that explain its provenance, current reference points, or reusable patterns.

Top-level fields:

- `schema_version`: registry schema version.
- `checkpoint_label`: GitHub label for checkpoint issues.
- `local_artifacts`: local review units to check against upstream refs.
- `watch_sources`: whole upstream inventories to watch for newly added, moved, or removed assets.

Each `local_artifacts` entry should include:

- `id`: stable machine-friendly local artifact identifier.
- `title`: human-readable local review unit.
- `kind`: component/workflow category.
- `local.paths`: local files or directories that belong to this review unit.
- `upstream_refs`: one or more upstream references for this local artifact.
- `attribution`: upstream credit, license notes, and provenance notes for the local artifact.
- `known_divergence`: intentional differences reviewers should not treat as defects.

Each `upstream_refs` item should include:

- `id`: stable machine-friendly upstream-ref identifier within the local artifact.
- `role`: why this upstream matters, such as `original_provenance`, `current_reference`, `source_adaptation`, `pattern_source`, `historical`, or `watch_only`.
- `status`: review posture, such as `active`, `historical`, `watch_only`, or `retired`.
- `repo`, `ref`, and `paths`: upstream repository, ref, and paths for that upstream ref.
- `attribution`: credit, license, and provenance notes specific to that upstream ref when useful.
- `last_reviewed`: checkpoint data for that upstream ref:
  - `commit`: upstream commit from the last confirmed checkpoint, or `null` for initial setup.
  - `checkpoint_issue`: last checkpoint issue URL/number, or `null`.
  - `reviewed_at`: timestamp of the last confirmed checkpoint, or `null`.
  - `notes`: brief baseline notes.

Each `watch_sources` entry should include:

- `id`, `title`, `repo`, `ref`, and `paths`: the upstream inventory to scan.
- `purpose`: why this inventory is watched and what kind of newly discovered assets should be flagged.
- `last_reviewed`: checkpoint data for the inventory scan.

Treat the registry as the current checkpoint, not the audit log. Treat GitHub checkpoint issues as the full narrative and decision log. Do not advance any `last_reviewed` field unless a human explicitly accepts the checkpoint baseline.

## Workflow

1. Confirm repository context.

   ```bash
   git rev-parse --show-toplevel
   git branch --show-current
   gh repo view --json nameWithOwner --jq .nameWithOwner
   ```

   If `gh` is unavailable or unauthenticated, continue with local comparison where possible and report that issue creation needs GitHub access.

2. Read `.pac/upstream-sources.yaml`.

   - If the file is missing, stop and ask whether to initialize it.
   - Validate each `local_artifacts` entry has the required fields above.
   - Validate each `upstream_refs` item has `id`, `role`, `status`, `repo`, `ref`, `paths`, and `last_reviewed`.
   - Validate each `watch_sources` entry has `id`, `title`, `repo`, `ref`, `paths`, `purpose`, and `last_reviewed`.
   - If a field is unknown or missing, report the exact local artifact ID, upstream-ref ID, or watch-source ID; continue only if the missing value is not needed for the requested scope.

3. Resolve review scope.

   - If the user named one local artifact ID, review that local artifact and its upstream refs.
   - If the user named one upstream-ref ID inside a local artifact, review only that upstream ref and its local mapping.
   - If the user named one watch-source ID, run only that inventory watch.
   - Otherwise review every local artifact and every watch source.
   - For initial upstream refs or watch sources with `last_reviewed.commit: null`, compare the current upstream head with the local mapped files or inventory and mark the range as `initial-baseline` instead of inventing a previous commit.

4. Fetch or refresh upstream repositories.

   Prefer `pac-librarian` for GitHub repositories so future runs reuse cached checkouts. For each upstream ref or watch source:

   ```bash
   bash skills/pac-librarian/checkout.sh <owner>/<repo> --path-only
   git -C <checkout> fetch --unshallow 2>/dev/null || true
   git -C <checkout> fetch --all --prune
   git -C <checkout> rev-parse <ref>
   ```

   `pac-librarian` creates shallow clones by default. Run `fetch --unshallow` first so that commit-range comparisons against older `last_reviewed` commits succeed.

   If an upstream ref is not a Git repository or cannot be fetched, record the access failure in the checkpoint findings for that review unit.

5. Walk upstream commit history before raw file comparison.

   For each upstream ref or watch source with a previous commit:

   ```bash
   git -C <checkout> log --oneline --decorate <last_reviewed_commit>..<current_head> -- <source paths...>
   git -C <checkout> diff --stat <last_reviewed_commit>..<current_head> -- <source paths...>
   ```

   For initial baselines, inspect current upstream files and recent history enough to understand the relationship without claiming a full historical review.

   Pay special attention to:

   - renamed, moved, removed, or radically rewritten files,
   - breaking workflow or API changes,
   - process, prompt-design, or authoring convention improvements,
   - commits whose rationale is unclear from the diff alone.

   For local artifacts with multiple upstream refs, compare each ref according to its `role` and `status`. For example, check `current_reference` refs for concrete improvements, while treating `original_provenance` or `historical` refs as provenance unless they contain a materially new idea.

6. Check whole-upstream watch sources for new assets.

   For each `watch_sources` entry, list all files under its watched paths at the current upstream head:

   ```bash
   git -C <checkout> ls-tree -r --name-only <ref> -- <watch paths...>
   ```

   Compare this list against the union of registered `upstream_refs[].paths` for the same repository. Flag newly added, moved, removed, or uncovered paths as inventory findings with suggested status `investigate` or `intentional divergence`. A watch-source finding should ask whether to create or update a local artifact entry, not assume adoption.

   Use watch sources for broad discovery. Keep local artifact reviews focused on the upstream refs already mapped to that artifact.

7. Pull linked upstream PRs/issues selectively.

   Use commit messages, GitHub autolinks, or `gh` only when the commit indicates a removal, rewrite, breaking change, major design shift, or unclear rationale. Do not exhaustively read every linked discussion.

8. Compare against local mappings.

   Inspect the mapped `local.paths` and summarize:

   - relevant differences,
   - useful ideas already present locally,
   - upstream changes that do not apply because of known divergence,
   - possible follow-up areas.

   Keep suggestions separate from decisions. Suggested statuses may be `adopt`, `ignore`, `defer`, `investigate`, or `intentional divergence`.

9. Ensure the checkpoint label exists.

   The registry-level `checkpoint_label` defaults to `pac:upstream-checkpoint`. Before creating an issue, check for it:

   ```bash
   gh label list --json name --jq '.[].name'
   ```

   If it is missing and the user approved setup, create it:

   ```bash
   gh label create "pac:upstream-checkpoint" --description "pac artifact: upstream inspiration review checkpoint" --color "BFDADC"
   ```

   If label creation fails, create the issue without the label and report the failure.

10. Create one checkpoint issue per run.

   Create a checkpoint issue when relevant changes, partial failures, or blocked sources are found. Use a title like:

   ```text
   Upstream inspiration checkpoint — YYYY-MM-DD
   ```

   Issue body structure:

   ````md
   <!-- pac:upstream-checkpoint -->
   ## Summary

   <one paragraph: relevant changes found / no relevant changes / partial failure>

   ## Local artifacts reviewed

   ### <local artifact id> — <title>

   - Local mapping: <paths>
   - Result: <changes found | no relevant changes | blocked | partial>

   #### Upstream refs

   - `<upstream-ref id>` (`<role/status>`): `<repo>@<ref>`
     - Range: `<last commit or initial-baseline>..<current head>`
     - Paths: `<source paths>`
     - Previous checkpoint: `<issue or none>`

   #### Findings

   List first-checkout findings as independently reviewable items. Use stable short IDs so the maintainer can review one finding or related group at a time.

   - [ ] `F-<n>` `<adopt|ignore|defer|investigate|intentional divergence>`: <finding and decision prompt>
   - No relevant upstream changes found.

   #### Notes for reviewers

   - <known divergence, upstream-ref role interpretation, blocked context, or grouping suggestion>

   ## Watch sources reviewed

   ### <watch-source id> — <title>

   - Upstream: `<repo>@<ref>`
   - Range: `<last commit or initial-baseline>..<current head>`
   - Watched paths: <paths>
   - Result: <new assets found | no inventory changes | blocked | partial>

   #### Inventory findings

   - [ ] `W-<n>` `<investigate|intentional divergence>`: <new, moved, removed, or uncovered upstream asset and decision prompt>

   ## Next checkpoint data

   ```yaml
   local_artifacts:
     - id: <local artifact id>
       upstream_ref: <upstream-ref id>
       commit: <current upstream head>
       checkpoint_issue: <this issue URL>
       reviewed_at: <ISO timestamp>
   watch_sources:
     - id: <watch-source id>
       commit: <current upstream head>
       checkpoint_issue: <this issue URL>
       reviewed_at: <ISO timestamp>
   ```

   ## Notes

   - Follow-up implementation issues should be created only after human confirmation.
   ````

1. Do not advance `.pac/upstream-sources.yaml` automatically.

    After creating the issue, ask whether to update `last_reviewed` entries from the `Next checkpoint data`. Only update the registry after explicit confirmation that the checkpoint decisions are accepted. For local artifacts, update only the matching `upstream_refs[].last_reviewed` item, not the whole artifact. For watch sources, update only the matching `watch_sources[].last_reviewed` item.

## No-change runs

By default, do not create a checkpoint issue when no relevant upstream changes are found. Instead, report the result in the conversation and note that the checkpoint baseline is unchanged.

If the user explicitly requests an issue even for no-change runs (for example with `--include-empty`), create a short checkpoint issue that makes the absence of relevant changes explicit. Do not create follow-up issues.

## Examples

Review every registered local artifact and watch source:

```text
/pac-upstream-checkpoints
```

Review one local artifact only:

```text
/pac-upstream-checkpoints pi-skills-agent-stuff-adaptations
```

Review one whole-upstream watch source only:

```text
/pac-upstream-checkpoints mattpocock-skills-watch
```

Initialize or repair the registry before running a review:

```text
/pac-upstream-checkpoints initialize registry
```
