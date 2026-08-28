# Checkpoint issue publication

Load this file only after the workflow determines that a checkpoint issue should be created.

## Label

Use the targeted registry result's `checkpoint_label`, defaulting to `pac:upstream-checkpoint`. The canonical color is defined in `extensions/pac-setup-workflows/config.ts`. Create a missing label only after setup approval:

```bash
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
checkpoint_label="<resolved checkpoint_label>"
if ! gh label list --repo "$repo" --json name --jq '.[].name' | grep -Fxq "$checkpoint_label"; then
  gh label create "$checkpoint_label" --repo "$repo" \
    --description "pac artifact: upstream inspiration review checkpoint" --color "C2E0C6"
fi
```

The issue marker is always `<!-- pac:upstream-checkpoint -->`; it is not the configurable label name. If label creation fails, publish without the label and report the failure.

## Issue

Create one issue per useful run with a title like:

```text
Upstream inspiration checkpoint — YYYY-MM-DD
```

Use only sections relevant to the resolved scope, but keep each finding independently reviewable:

````md
<!-- pac:upstream-checkpoint -->
## Summary

<relevant changes / explicit no-change publication / partial failure>

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

- [ ] `W-<n>` `<investigate|intentional divergence>`: <decision prompt>
  - Currently uncovered: <complete path list, grouped if useful>
  - Suggested decision: <create/update local artifact entry | explicitly ignore | keep watching>

## Next checkpoint data

Apply each `local_artifacts` item to the matching `local_artifacts[].upstream_refs[]` entry, and each `watch_sources` item to the matching watch entry:

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

- Follow-up implementation issues require human confirmation.
- Registry baseline advancement requires separate human acceptance.
````

For an explicitly requested no-change issue, state the absence of relevant changes and do not create follow-up issues.
