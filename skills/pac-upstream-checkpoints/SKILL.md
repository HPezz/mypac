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

Each source entry should include:

- `id`: stable machine-friendly source identifier
- `title`: human-readable review unit
- `kind`: component/workflow category
- `source.repo`: upstream repository URL
- `source.ref`: branch, tag, or ref to inspect
- `source.paths`: upstream paths relevant to this review unit
- `local.paths`: local files or directories that map to the upstream source
- `attribution`: upstream credit, license notes, and provenance notes
- `known_divergence`: intentional differences reviewers should not treat as defects
- `last_reviewed`: current machine-readable checkpoint:
  - `commit`: upstream commit from the last confirmed checkpoint, or `null` for initial setup
  - `checkpoint_issue`: last checkpoint issue URL/number, or `null`
  - `reviewed_at`: timestamp of the last confirmed checkpoint, or `null`
  - `notes`: brief baseline notes

Treat the registry as the current checkpoint, not the audit log. Treat GitHub checkpoint issues as the full narrative and decision log.

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
   - Validate that each entry has the required fields above.
   - If a field is unknown or missing, report the exact source ID and continue only if the missing value is not needed for the requested scope.

3. Resolve source scope.

   - If the user named one source ID, review only that source.
   - Otherwise review every source entry.
   - For initial entries with `last_reviewed.commit: null`, compare the current upstream head with the local mapped files and mark the range as `initial-baseline` instead of inventing a previous commit.

4. Fetch or refresh upstream repositories.

   Prefer `pac-librarian` for GitHub repositories so future runs reuse cached checkouts. For each source:

   ```bash
   bash skills/pac-librarian/checkout.sh <owner>/<repo> --path-only
   git -C <checkout> fetch --unshallow 2>/dev/null || true
   git -C <checkout> fetch --all --prune
   git -C <checkout> rev-parse <ref>
   ```

   `pac-librarian` creates shallow clones by default. Run `fetch --unshallow` first so that commit-range comparisons against older `last_reviewed` commits succeed.

   If a source is not a Git repository or cannot be fetched, record the access failure in the checkpoint findings.

5. Walk upstream commit history before raw file comparison.

   For each source with a previous commit:

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

6. Discover new upstream assets not yet in the registry.

   For each source, derive the parent directories from `source.paths` (for example `extensions/` and `skills/`) and list all files under those directories at the current upstream head:

   ```bash
   git -C <checkout> ls-tree -r --name-only <ref> -- <parent dirs...>
   ```

   Compare this list against the union of `source.paths` across all registry entries for the same repository. Flag any paths that are not covered by an existing entry as potential new upstream assets. Include these in the checkpoint findings with a suggested status of `investigate` so a maintainer can decide whether to add them to the registry.

   Skip this step when the source uses the `documentation-pattern` kind or when the upstream paths are individual files rather than directory-scoped.

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

   ## Sources reviewed

   ### <source id> — <title>

   - Upstream: <repo>@<ref>
   - Range: <last commit or initial-baseline>..<current head>
   - Local mapping: <paths>
   - Previous checkpoint: <issue or none>
   - Result: <changes found | no relevant changes | blocked | partial>

   #### Findings

   - <finding, or "No relevant upstream changes found.">

   #### Suggested decisions

   - [ ] <adopt|ignore|defer|investigate|intentional divergence>: <decision prompt>

   ## Next checkpoint data

   ```yaml
   sources:
     - id: <source id>
       commit: <current upstream head>
       checkpoint_issue: <this issue URL>
       reviewed_at: <ISO timestamp>
   ```

   ## Notes

   - Follow-up implementation issues should be created only after human confirmation.
   ````

1. Do not advance `.pac/upstream-sources.yaml` automatically.

    After creating the issue, ask whether to update `last_reviewed` entries from the `Next checkpoint data`. Only update the registry after explicit confirmation that the checkpoint decisions are accepted.

## No-change runs

By default, do not create a checkpoint issue when no relevant upstream changes are found. Instead, report the result in the conversation and note that the checkpoint baseline is unchanged.

If the user explicitly requests an issue even for no-change runs (for example with `--include-empty`), create a short checkpoint issue that makes the absence of relevant changes explicit. Do not create follow-up issues.

## Examples

Review every registered source:

```text
/pac-upstream-checkpoints
```

Review one source only:

```text
/pac-upstream-checkpoints agent-stuff-pi-skills
```

Initialize or repair the registry before running a review:

```text
/pac-upstream-checkpoints initialize registry
```
