# Project Preferences

## Tooling

This project uses [opencode](https://opencode.ai) as the AI coding assistant.
Do NOT suggest or create configurations for vendor-specific CLIs (Claude Code, Codex, etc.).

- Shared kit assets belong at the repository root in `agents/`, `commands/`, `plugins/`, and `skills/`
- Project-local overlay assets belong in `.opencode/`
- Do NOT place them in `.claude/`, `.cursor/`, or any other vendor-specific directory

## Execution Heuristics

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## OpenSpec Workflow

- OpenSpec is available in this repo as the planning layer for meaningful multi-step changes.
- OpenSpec artifacts live under `openspec/`; the shared kit lives at the repository root and project-local overlays stay under `.opencode/`.
- Use OpenSpec for non-trivial features, refactors, migrations, and ambiguous bugfixes.
- Skip OpenSpec for tiny obvious edits that do not benefit from proposal/spec/task artifacts.
- Commit meaningful OpenSpec artifacts when they preserve rationale, review context, or implementation history.
- Commit implementation work during the change, not only at the end.
- Use one atomic commit per meaningful task group or work slice once it is complete and verified.
- For OpenSpec changes, include the corresponding `tasks.md` checkbox updates in the same commit as the completed slice.
- Do not create one commit per tiny checkbox or file, and do not batch unrelated work into one large commit.
- Select commit files explicitly; if unrelated files are already staged, leave them out of the current commit.
- Keep the human in the loop: treat OpenSpec as a scaffold for planning and review, not a fire-and-forget implementation engine.
