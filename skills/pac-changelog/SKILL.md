---
name: pac-changelog
description: "Update the repository CHANGELOG.md for notable changes and release prep. Use when finishing meaningful work that should be recorded before merge or when preparing a release section."
license: MIT
compatibility: Pi coding agent
metadata:
  author: mypac
  stage: shared
---

# Update the changelog

Use this skill when work in this repository should be recorded in `CHANGELOG.md` before merge or when the user explicitly asks to prepare a release section.

## Goal

Keep `CHANGELOG.md` current as the curated source of notable repository changes.

## Default scope

- Edit `CHANGELOG.md` only unless the user explicitly asks for related docs changes.
- By default, target the heading-delimited `## [Unreleased]` section.
- Expand beyond that section only for release prep, retrospective work, or a concrete ambiguity.
- Prepare a versioned release section only when the user explicitly asks for release prep.

## Entry rules

- Record notable user-facing, workflow-facing, or repository-operating changes.
- Skip tiny internal edits that would add noise to the changelog.
- Prefer these headings:
  - `Added`
  - `Changed`
  - `Fixed`
- Add `Removed` or `Breaking Changes` only when needed.
- Reuse an existing heading when present instead of creating duplicates.
- Keep one bullet per distinct change.
- Match the existing concise style in the file.
- Link the relevant GitHub issue or pull request when it adds useful context.

## Workflow

### Normal updates

1. Read the `## [Unreleased]` section of `CHANGELOG.md`.
2. Check whether the change is notable enough to record.
3. For retrospective updates, inspect relevant historical changelog sections and commits since the latest release tag only when needed to find missing notable changes.
4. Update or add the smallest useful bullet under `## [Unreleased]`.
5. Avoid duplicate or overlapping bullets; merge or rewrite when needed.
6. Keep the changelog update in the same commit as the work it describes when practical.

### Release prep

When the user explicitly asks to prepare a release:

1. Start with the `## [Unreleased]` section of `CHANGELOG.md`.
2. Choose the requested version and release date, or ask if either is missing.
3. Only when needed to choose the insertion point or preserve surrounding format, read the destination/release structure.
4. Move the relevant bullets out of `## [Unreleased]` into a new section:

   ```md
   ## [x.y.z] - YYYY-MM-DD
   ```

5. Keep only the headings that still have entries.
6. Recreate an empty `## [Unreleased]` section at the top.
7. Preserve existing older release sections as-is unless the user asks for cleanup.
8. If helpful, draft GitHub release notes from the new changelog section, but do not publish anything unless the user asks.

## Guardrails

- Do not invent release versions or dates.
- Do not rewrite older release sections unless the user asks.
- Do not publish tags or GitHub releases unless the user explicitly asks.
- Do not turn the changelog into an implementation diary.
