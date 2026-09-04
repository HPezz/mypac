---
name: pac-to-prd
disable-model-invocation: true
description: "Synthesize current context into a structured PRD draft or publishable PRD artifact using a shared template. Use when the user wants a PRD from conversation context, a forge issue or change request, or a saved draft path."
license: MIT
compatibility: Pi coding agent
metadata:
  author: mypac
  stage: shared
---

# Turn context into a PRD

Use this skill when the user wants a PRD from the current conversation, an issue, or an existing local PRD draft.

Do **not** run a broad discovery interview. Synthesize what is already known from the conversation, issue context, and codebase.

If a critical ambiguity blocks a useful draft, ask at most one narrow follow-up question.

## Inputs

The input may be:

- current conversation context
- a GitHub issue/PR or GitLab issue/MR URL
- a local draft path under `~/.pi/agent/prds/`
- short free text that points at the work

If the input is a local draft path, treat that draft as the source of truth. Do **not** resynthesise the PRD from current chat context unless the user explicitly asks you to rewrite it.

## Publication modes

Support exactly these modes:

- `draft-only`
- `comment-on-issue`
- `create-issue`

Default to `draft-only` unless the user clearly asks for publication to the resolved GitHub or GitLab forge.

## Process

1. Resolve the source material.

   - If given an issue or change-request URL, read the minimum relevant context first through `gh` or `glab`; call it a pull request on GitHub and a merge request on GitLab.
   - If given a local draft path, read the file and use it as the authoritative source.
   - Otherwise, use the current conversation plus focused repo exploration.
   - PRs and MRs may provide context but are never PRD publication destinations. Resolve an explicitly linked issue first (`closingIssuesReferences` on GitHub or the MR's closing-issue references on GitLab).
   - If the user wants `comment-on-issue` and no target issue is obvious or linked from the change request, ask one narrow follow-up question. Do not create a target issue automatically.

2. Explore the repo enough to sketch the likely module shape and testing scope.

   **Skip this step when the input is a local draft path.** The draft is already the source of truth; do not derive a new module shape from the repo that could silently override it.

   - Actively look for opportunities to propose deep, testable modules instead of shallow glue.
   - Keep this sketch concrete enough to review, but do not drop into file-by-file implementation planning.

3. Show one review checkpoint **before producing the draft or publishing to a forge issue**.

   Present:

   - proposed PRD title
   - proposed module shape
   - proposed testing scope
   - intended publication mode
   - main and related context links you plan to include

   Allow one review pass to correct the framing. Do not turn this into an open-ended grilling session.

4. Build the PRD body using [`../pac-grill-with-docs/PRD-FORMAT.md`](../pac-grill-with-docs/PRD-FORMAT.md).

   - Reuse that shared format for PRD **content**.
   - Keep publication wrappers out of the shared body.
   - Do not include file paths or code snippets.

5. Handle output based on the publication mode.

### `draft-only`

Write a local draft outside the repo under:

```text
~/.pi/agent/prds/<timestamp>-<slug>.md
```

Use a UTC timestamp such as `YYYYMMDD-HHMMSS`. Derive `<slug>` from the PRD title as a lowercase, hyphen-separated summary (e.g. `pac-to-prd-draft-workflow`).

Store minimal human-editable metadata as YAML frontmatter:

```yaml
---
title: PRD — {short title}
source: {conversation | issue URL | draft path | free text summary}
publish_mode: draft-only
main_issue: {optional main issue number or URL}
related_issues:
  - {optional related issue number or URL}
---
```

- `main_issue` is optional.
- `related_issues` is optional.
- Omit optional fields when they do not apply.

Then place the shared PRD body below the frontmatter.

Return the saved path to the user. Treat this draft file as a first-class artifact for later publish/update runs.

### `comment-on-issue`

Before any remote write, read the latest issue body, comments, and labels, show the exact write set (new comment, issue-body section update, and optional label), and require explicit final confirmation from the user.

When publishing from a local draft file:

- use the draft file as the source of truth
- do not silently resynthesise the PRD
- strip local draft frontmatter from the published comment body

Then, use `gh issue comment`/`gh issue edit` for GitHub or `glab issue note create`/`glab issue update` for GitLab against the resolved issue:

- prepend `<!-- pac:prd -->`
- create a **new** PRD iteration comment each run
- do **not** edit the prior PRD comment in place
- update or create `## PRDs` in the issue body with a link to the new comment
- add or keep the `pac:prd` label only when that label already exists in the target repository
- never create missing labels automatically

### `create-issue`

Before issue creation, show the resolved provider, destination project, title, body source, and existing labels to apply, then require explicit final confirmation from the user.

When publishing from a local draft file:

- use the draft file as the source of truth
- do not silently resynthesise the PRD

Then:

- create a new GitHub or GitLab issue through `gh issue create` or `glab issue create`; its title is a concise, scannable version of the PRD title and its **body is the PRD itself**
  - derive the issue title from the PRD title, but do not mirror it mechanically when a shorter title is clearer
  - prefer a short imperative or descriptive title that names the concrete work, such as `Improve pac-to-prd issue titles`
  - strip PRD/publication wrappers and redundant framing such as `PRD —`, `Create issue for`, or broad context already obvious from the repository
  - preserve the specific subject so issue lists remain understandable without opening the issue
  - avoid conventional-commit prefixes like `feat:` unless the user explicitly supplied that style
- do **not** create a duplicate PRD comment
- add `pac:ready_for_agent` and `pac:prd` only when those labels already exist in the target repository
- never create missing labels automatically

## Forge publication safety rules

- Publish PRD artifacts only to issues. Never post them to a pull request or merge request discussion.
- Surface `gh` or `glab` failures plainly; never fall back to the other provider.
- Re-read the latest issue state immediately before each confirmed mutation so reserved `## PRDs` links do not stomp concurrent edits.
- Missing labels remain non-blocking: warn clearly, skip them, and tell the user to run the repo-local `/pac-setup-workflows` command.
- Keep forge publication explicit and non-invasive.
- Do not reference external setup skills or ad hoc setup mechanisms; `/pac-setup-workflows` is the canonical pac label setup command.

## When to stop and redirect

- If the user actually needs discovery rather than synthesis, suggest `pac-grill-with-docs` or `/pac-explore`.
- If the user wants implementation, keep the PRD concise and then hand off to the planning or implementation workflow.
