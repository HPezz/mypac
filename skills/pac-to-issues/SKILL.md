---
name: pac-to-issues
disable-model-invocation: true
description: "Break a plan, PRD, or discussion into independently grabbable issues with a portable Markdown dependency graph. Use when creating tracer-bullet issues on GitHub or GitLab."
license: MIT
compatibility: Git repository; gh or glab CLI required.
metadata:
  author: mypac
  stage: shared
---

# Create portable issue graphs

Break an approved plan into thin, independently verifiable vertical slices. The issue bodies are the authoritative portable graph; provider-native parent and dependency relationships are optional enrichment.

## 1. Resolve source and destination

Use conversation context, a local PRD draft, free text, or a GitHub issue/PR or GitLab issue/MR URL. Resolve an explicit URL first, then the current tracking remote, then `origin`; ask rather than guessing if ambiguous.

Read a forge source through its provider:

```sh
gh issue view <number> --repo <owner/repo> --comments
gh pr view <number-or-url> --repo <owner/repo> --comments
glab issue view <full-url> --output json --comments --per-page 100
glab mr view <iid> --repo <full-project-url> --output json --comments --per-page 100
```

A source issue becomes the optional parent. A conversation, draft, free-text plan, PR, or MR may have no parent; do not invent one.

## 2. Draft tracer-bullet slices

Each slice must deliver a narrow end-to-end behavior across every relevant layer. Do not create horizontal tickets such as “all tests” or “all schemas.” Classify each slice:

- **HITL** — requires human judgment, access, design review, or approval
- **AFK** — can be implemented autonomously with deterministic verification

For each slice show title, type, blockers, and one-sentence summary. Ask the user to approve granularity, dependencies, and HITL/AFK classifications before any remote write.

## 3. Create in dependency order

After explicit confirmation, create blockers first so every dependent body can contain real references. Use a temporary body file.

GitHub:

```sh
gh issue create --repo <owner/repo> --title "<title>" --body-file <body-file>
```

GitLab:

```sh
glab issue create --repo <full-project-url> --title "<title>" \
  --description-file <body-file> --yes
```

Apply `pac:hitl` or `pac:afk` only when it already exists. Missing labels are non-blocking: report the exact label, skip it, and direct the user to `/pac-setup-workflows`. Never create labels from this workflow.

If any issue creation fails, keep and report all successfully created issue URLs. Do not claim relationships for an issue that was not created.

## Portable issue body

Every created issue records its graph in Markdown using the actual URLs returned by the provider:

```md
## Summary

<one complete vertical slice>

## Motivation

<why this slice matters>

## Acceptance Criteria

- [ ] <observable outcome>
- [ ] <verification outcome>

## Type

HITL / AFK — <reason>

## Parent

- [<parent title>](<real parent issue URL>)

## Blocked by

- [<blocker title>](<real created blocker issue URL>)
```

Omit `## Parent` when there is no parent. Write `None — can start immediately.` under `## Blocked by` when there are no blockers. This Markdown graph must be complete even when native relationships are unavailable.

## 4. Add native relationships when supported

After each issue is created and its Markdown graph is durable, discover provider support and attempt native relationships:

- GitHub: `addSubIssue` and `addBlockedBy` GraphQL mutations.
- GitLab: issue-link APIs for blocking dependencies and the available work-item parent/child API only when supported by the host version, project settings, and license.

Native relationships are non-blocking enrichment. For every unsupported or failed relationship, report:

- provider and operation
- source and target issue URLs
- unsupported capability or exact CLI/API failure
- confirmation that the Markdown relationship remains authoritative

Do not discard created issues, remove Markdown relationships, switch providers, or report enrichment as successful after a failure.

## 5. Update the parent safely

If a parent issue exists:

1. Re-read its latest body immediately before mutation.
2. Preserve all non-reserved content.
3. Create or update only `## Tasks` with real issue links:

   ```md
   ## Tasks

   - [ ] [First slice](<real issue URL>)
   - [ ] [Second slice](<real issue URL>)
   ```

4. Show the body update and require explicit confirmation.
5. Apply it through `gh issue edit` or `glab issue update`.

With no parent, skip this step.

## Completion report

Report created issue URLs in dependency order, applied or missing labels, native relationship successes, precise enrichment failures, and whether the parent task section was updated. Surface `gh` and `glab` errors plainly.
