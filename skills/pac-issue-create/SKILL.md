---
name: pac-issue-create
description: "Create a structured issue on the resolved GitHub or GitLab forge. Use when capturing work through /issue-create or its /ghi compatibility alias."
license: MIT
compatibility: Git repository; gh or glab CLI required.
metadata:
  author: mypac
  stage: shared
---

# Forge-neutral issue creation

Create one useful issue in the repository and provider already resolved by the caller. Use `gh` for GitHub and `glab` for GitLab, including authenticated self-hosted GitLab instances and nested namespaces.

## Issue content

Derive a concise, scannable title from the note. Ask at most one brief question only when the note is too ambiguous to produce useful acceptance criteria.

Write a proportional structured issue body:

```md
## Summary

<short summary>

## Motivation

<why this matters>

## Acceptance Criteria

- [ ] <first concrete outcome>
- [ ] <second concrete outcome>
```

## Pac state label

Infer at most one pac workflow state label when intent is clear:

- `pac:ready_for_agent` for an implementation-ready, agent-executable issue
- `pac:ready_for_human` when human judgment, access, approval, or manual action is required
- `pac:needs_triage` for vague or unreviewed inbound work

Check labels on the resolved repository before applying one:

```sh
gh label list --repo <host/owner/repo> --json name --jq '.[].name'
glab label list --repo <full-project-url> --output json --per-page 100
```

If the inferred label is missing, create the issue without it and report:

```text
Expected pac workflow label is missing: <label>
Run /pac-setup-workflows to create or migrate pac workflow labels.
```

Never create a missing label from this workflow.

## Create through the resolved provider

Write the body to a temporary file to avoid shell-escaping errors.

GitHub:

```sh
gh issue create \
  --repo <host/owner/repo> \
  --title "<title>" \
  --body-file <body-file> \
  [--label "<existing-pac-label>"]
```

GitLab:

```sh
glab issue create \
  --repo <https://host/group/subgroup/project> \
  --title "<title>" \
  --description-file <body-file> \
  --yes \
  [--label "<existing-pac-label>"]
```

Return the created issue URL and say whether a pac state label was applied. Surface `gh` or `glab` errors clearly instead of paraphrasing them away.

## Constraints

- Create one issue only; do not list, close, or review issues.
- Use the caller's resolved host and project. Do not resolve a different destination or fall back from one provider to the other.
- Do not broaden the note's scope.
- `/ghi` is only a compatibility alias; its GitHub behavior uses this same workflow.
