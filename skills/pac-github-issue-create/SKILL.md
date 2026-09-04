---
name: pac-github-issue-create
description: "Create a GitHub-only issue in the current repository with gh. Use when a caller explicitly requests the legacy provider-specific workflow; /issue-create and /ghi use pac-issue-create instead."
license: MIT
compatibility: Git repository; gh CLI required.
metadata:
  author: mypac
  stage: shared
---

# GitHub issue creation skill

Use this skill when the user wants to create a GitHub issue in the current repository.

## Goal

Turn the provided note into a useful GitHub issue with:

- a concise title
- a structured body
- an inferred pac workflow state label when the user's intent is clear and the label exists
- a created issue URL returned to the user

## Workflow

1. Confirm you are in a git repository:

   ```bash
   git rev-parse --is-inside-work-tree
   ```

   If this fails, stop and explain that issue creation must run inside a git repository.

2. Confirm `gh` is available:

   ```bash
   gh --version
   ```

   If this fails, stop and explain that the GitHub CLI is required.

3. Resolve the current repository with GitHub CLI:

   ```bash
   gh repo view --json nameWithOwner --jq .nameWithOwner
   ```

   If this fails, stop and explain that `gh` must be authenticated and have access to the repository.

4. Use the provided note to draft the issue.

   - If the note already reads like a good issue title, you may reuse it.
   - Otherwise, derive a short imperative or descriptive title.
   - Prefer concise, scannable titles that name the concrete work without redundant framing.
   - Avoid conventional-commit prefixes like `feat:` unless the user explicitly supplied that style.
   - Ask at most one brief follow-up question only if the note is too ambiguous to create a useful issue.

5. Create a structured issue body with these sections:

   ```md
   ## Summary

   <short summary>

   ## Motivation

   <why this matters>

   ## Acceptance Criteria

   - [ ] <first concrete outcome>
   - [ ] <second concrete outcome>
   ```

   Keep the body proportional to the note. For a tiny note, stay concise.

6. Infer at most one pac workflow state label when the user's intent is clear.

   Supported pac state labels and when to apply them:

   - `pac:ready_for_agent` — the note clearly asks for an agent-executable implementation issue with enough context and acceptance criteria for an AFK agent.
   - `pac:ready_for_human` — the issue requires human judgment, access, approval, manual action, or maintainer-only decisions.
   - `pac:needs_triage` — the note is vague, inbound, copied from an unreviewed source, explicitly asks for later triage, or lacks enough context for implementation.

   If intent is ambiguous, keep the flow lightweight: either ask one concise follow-up question if it would materially improve the issue, or create the issue without a pac state label.

7. Check whether the inferred label exists before using it.

   Prefer querying labels explicitly:

   ```bash
   gh label list --repo <owner/repo> --json name --jq '.[].name'
   ```

   If the inferred pac label is missing, create the issue without that label and warn clearly:

   ```text
   Expected pac workflow label is missing: <label>
   Run /pac-setup-workflows to create or migrate pac workflow labels.
   ```

   Do not create missing labels from this skill.

8. Create the issue with `gh issue create` against the current repository.

   Prefer passing the repo explicitly:

   ```bash
   gh issue create --repo <owner/repo> --title "<title>" --body-file <temp-file>
   ```

   When an inferred pac state label exists, pass it explicitly:

   ```bash
   gh issue create --repo <owner/repo> --title "<title>" --body-file <temp-file> --label "<pac-label>"
   ```

   Use a temp file for the body when that is simpler than shell escaping.

9. Return the created issue URL to the user. Include the applied pac state label, or note that no pac state label was applied.

## Linked issues

Only when the request clearly requires a parent, sub-issue, or dependency relationship (for example, “make this a sub-issue of #12,” “blocked by #42,” or “blocks #42”), read and follow [LINKING.md](LINKING.md) after drafting the issue.

Do not read `LINKING.md` for an ordinary standalone issue. It is a conditional continuation of this creation workflow, not a separate interactive `/ghi link` command.

## Constraints

- This skill is only for creating an issue, not listing, opening, closing, or reviewing issues.
- Do not broaden scope beyond the provided note.
- Apply at most one pac workflow state label during issue creation.
- Do not create missing labels; warn and suggest `/pac-setup-workflows` instead.
- Surface `gh` errors clearly instead of paraphrasing them away.
- If creation succeeds, include the final issue URL in the response.
