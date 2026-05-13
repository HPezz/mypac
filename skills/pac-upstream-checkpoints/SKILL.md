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

Do not implement upstream changes from this workflow. Suggest follow-up areas and ask for human confirmation before creating implementation issues or advancing registry baselines.

## Model

The registry model and glossary live in `MODEL.md` in this skill directory.

Core contract:

- The registry is local-first: start from the exact local artifact we maintain.
- One `local_artifacts` entry represents one individually maintainable skill, extension, prompt, document, or script.
- Broad artifact groups are not registry entries. Use optional tags/categories only for navigation if needed.
- `watch_sources` are whole-upstream inventory scans and are not local artifacts.
- Every upstream ref and watch source declares `sync_policy`.
- `last_reviewed` is pointer-only: `upstream_commit`, `checkpoint_issue`, `reviewed_at`, and `notes`.
- Review decisions live in GitHub checkpoint issues, not in `last_reviewed`.

## Registry validation

Read `.pac/upstream-sources.yaml` before review. Required top-level fields:

- `schema_version`
- `checkpoint_label`
- `local_artifacts`
- `watch_sources`

Each `local_artifacts` entry should include:

- `id`: stable machine-friendly local artifact identifier.
- `title`: human-readable local review unit.
- `kind`: one of `skill`, `extension`, `prompt`, `document`, or `script`.
- `local.paths`: local files or directories belonging to this artifact.
- `upstream_refs`: one or more upstream references.
- `attribution`: upstream credit, license notes, and provenance notes.
- Optional `known_divergence` and `do_not_chase`.

Each `upstream_refs` item should include:

- `id`: globally unique upstream-ref identifier.
- `role`
- `status`
- `sync_policy`: `provenance_only`, `targeted`, or `inventory_watch`.
- `repo`, `ref`, and `paths`
- `attribution`
- `last_reviewed.upstream_commit`
- `last_reviewed.checkpoint_issue`
- `last_reviewed.reviewed_at`
- `last_reviewed.notes`
- Optional `known_divergence` and `do_not_chase`.

Each `watch_sources` entry should include:

- `id`, `title`, `sync_policy`, `repo`, `ref`, and `paths`
- `purpose`
- `last_reviewed.upstream_commit`
- `last_reviewed.checkpoint_issue`
- `last_reviewed.reviewed_at`
- `last_reviewed.notes`

If a required field is missing, report the exact artifact/ref/source ID. Continue only if the missing value is not needed for the requested scope.

## Workflow

1. Confirm repository context.

   ```bash
   git rev-parse --show-toplevel
   git branch --show-current
   gh repo view --json nameWithOwner --jq .nameWithOwner
   ```

   If `gh` is unavailable or unauthenticated, continue with local comparison where possible and report that issue creation needs GitHub access.

2. Resolve review scope.

   - If the user named one local artifact ID, review that local artifact and its upstream refs.
   - If the user named one upstream-ref ID inside a local artifact, review only that upstream ref and its local mapping.
   - If the user named one watch-source ID, run only that inventory watch.
   - Otherwise review every local artifact and every watch source.
   - For `sync_policy: provenance_only`, verify attribution/provenance only unless the user explicitly asks for comparison.
   - For `sync_policy: targeted`, look for concrete transferable improvements, not feature parity.
   - For `sync_policy: inventory_watch`, scan for upstream inventory changes.
   - For initial upstream refs or watch sources with `last_reviewed.upstream_commit: null`, compare the current upstream head with the local mapped files or inventory and mark the range as `initial-baseline`.

3. Fetch or refresh upstream repositories.

   Prefer `pac-librarian` for GitHub repositories so future runs reuse cached checkouts:

   ```bash
   bash skills/pac-librarian/checkout.sh <repo-url-or-owner/repo> --path-only
   git -C <checkout> fetch --unshallow 2>/dev/null || true
   git -C <checkout> fetch --all --prune
   current_head="$(git -C <checkout> rev-parse "origin/<ref>" 2>/dev/null || git -C <checkout> rev-parse "<ref>")"
   ```

   Prefer the fetched remote-tracking ref (`origin/<ref>`) for branch names so a stale local branch does not become the checkpoint head. Use the plain `<ref>` fallback for tags, commit SHAs, or non-branch refs.

   If an upstream ref cannot be fetched or resolved, record the access failure in checkpoint findings.

4. Walk upstream commit history before raw file comparison.

   For each upstream ref or watch source with a previous commit, compare against the resolved `current_head` from step 3:

   ```bash
   git -C <checkout> log --oneline --decorate <last_reviewed_upstream_commit>..<current_head> -- <source paths...>
   git -C <checkout> diff --stat <last_reviewed_upstream_commit>..<current_head> -- <source paths...>
   ```

   For initial baselines, inspect current upstream files and recent history enough to understand the relationship without claiming a full historical review.

   Pay special attention to renames, removals, rewrites, breaking workflow/API changes, and process, prompt-design, or authoring convention improvements. Pull linked upstream PRs/issues selectively when commits indicate unclear rationale, removals, rewrites, breaking changes, or major design shifts.

5. Compare against local mappings.

   Inspect mapped `local.paths` and summarize:

   - relevant differences,
   - useful ideas already present locally,
   - upstream changes that do not apply because of `known_divergence` or `do_not_chase`,
   - possible follow-up areas.

   Keep suggestions separate from decisions. Suggested statuses may be `adopt`, `ignore`, `defer`, `investigate`, or `intentional divergence`.

6. Check whole-upstream watch sources.

   For each `watch_sources` entry, list files under the watched paths at the current upstream head:

   ```bash
   git -C <checkout> ls-tree -r --name-only <current_head> -- <watch paths...>
   ```

   Compare this list against registered upstream refs for the same repository. Inventory review must be exhaustive for the requested watch scope:

   - List every uncovered upstream artifact path, not only notable examples.
   - Group long inventories by category or directory, but do not replace the full list with `such as`, `etc.`, or similar shorthand.
   - For initial baselines, call findings `currently uncovered` rather than `new` unless commit history proves when the asset appeared.
   - For later checkpoints, distinguish `new`, `moved`, `removed`, and `still uncovered` paths when the previous baseline supports that distinction.
   - If the list is too large for one compact bullet, include a nested list or collapsible-style Markdown section inside the checkpoint issue body.

   A watch-source finding asks whether to create or update a local artifact entry, explicitly ignore coverage, or keep watching; it does not assume adoption.

7. Ensure the checkpoint label exists.

   Use the registry-level `checkpoint_label`, which defaults to `pac:upstream-checkpoint`. The current canonical label color is defined in `extensions/pac-setup-workflows/config.ts`. Create the label only when missing and setup is approved.

   ```bash
   repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
   checkpoint_label="$(awk -F': *' '$1 == "checkpoint_label" { print $2; found=1; exit } END { if (!found) print "pac:upstream-checkpoint" }' .pac/upstream-sources.yaml)"
   if ! gh label list --repo "$repo" --json name --jq '.[].name' | grep -Fxq "$checkpoint_label"; then
     # Run this create command only after the user approves setup.
     gh label create "$checkpoint_label" --repo "$repo" --description "pac artifact: upstream inspiration review checkpoint" --color "C2E0C6"
   fi
   ```

   The checkpoint issue marker remains `<!-- pac:upstream-checkpoint -->`; it is an artifact marker, not the configurable GitHub label name. If label creation fails, create the issue without the label and report the failure.

8. Create one checkpoint issue per run when useful.

   Create a checkpoint issue when relevant changes, partial failures, or blocked sources are found. Use a title like:

   ```text
   Upstream inspiration checkpoint — YYYY-MM-DD
   ```

   Body structure:

   ````md
   <!-- pac:upstream-checkpoint -->
   ## Summary

   <relevant changes found / no relevant changes / partial failure>

   ## Local artifacts reviewed

   ### <local artifact id> — <title>

   - Local mapping: <paths>
   - Result: <changes found | no relevant changes | blocked | partial>

   #### Upstream refs

   - `<upstream-ref id>` (`<role>/<status>/<sync_policy>`): `<repo>@<ref>`
     - Range: `<last commit or initial-baseline>..<current head>`
     - Paths: `<source paths>`
     - Previous checkpoint: `<issue or none>`

   #### Findings

   - [ ] `F-<n>` `<adopt|ignore|defer|investigate|intentional divergence>`: <finding and decision prompt>
   - No relevant upstream changes found.

   #### Notes for reviewers

   - <known divergence, do-not-chase rule, blocked context, or sync-policy note>

   ## Watch sources reviewed

   ### <watch-source id> — <title>

   - Upstream: `<repo>@<ref>`
   - Range: `<last commit or initial-baseline>..<current head>`
   - Watched paths: <paths>
   - Result: <new assets found | no inventory changes | blocked | partial>

   #### Inventory findings

   - [ ] `W-<n>` `<investigate|intentional divergence>`: <inventory finding and decision prompt>
     - Currently uncovered: `<complete path list, grouped if useful>`
     - Suggested decision: <create/update local artifact entry | explicitly ignore | keep watching>

   ## Next checkpoint data

   This is a summarized patch format. Apply each `local_artifacts` item to the matching `local_artifacts[].upstream_refs[]` entry's `last_reviewed`, and each `watch_sources` item to the matching `watch_sources[]` entry's `last_reviewed`.

   ```yaml
   local_artifacts:
     - id: <local artifact id>
       upstream_ref: <upstream-ref id>
       last_reviewed:
         upstream_commit: <current upstream head>
         checkpoint_issue: <this issue URL>
         reviewed_at: <ISO timestamp>
   watch_sources:
     - id: <watch-source id>
       last_reviewed:
         upstream_commit: <current upstream head>
         checkpoint_issue: <this issue URL>
         reviewed_at: <ISO timestamp>
   ```

   ## Notes

   - Follow-up implementation issues should be created only after human confirmation.
   ````

9. Do not advance `.pac/upstream-sources.yaml` automatically.

   After creating the issue, ask whether to update `last_reviewed` entries from the `Next checkpoint data`. Update only after explicit confirmation that the checkpoint baseline is accepted. If a later corrected checkpoint supersedes an earlier run, comment on both issues, close the stale checkpoint, and use only the accepted latest checkpoint data for baseline updates.

## No-change runs

By default, do not create a checkpoint issue when no relevant upstream changes are found. Instead, report the result in the conversation and note that the checkpoint baseline is unchanged.

If the user explicitly requests an issue even for no-change runs, create a short checkpoint issue that makes the absence of relevant changes explicit. Do not create follow-up issues.

## Examples

Review every registered local artifact and watch source:

```text
/pac-upstream-checkpoints
```

Review one local artifact only:

```text
/pac-upstream-checkpoints pi-skill-github
```

Review one watch source only:

```text
/pac-upstream-checkpoints mattpocock-skills-watch
```
