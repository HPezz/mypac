---
name: pac-commit
description: Create or plan repository-compliant commits from existing changes. Load immediately for a standalone commit, split, fixup, amend, reword, or commit-planning request. In an implementation workflow, load when commit preparation becomes relevant; this may be before proportionate verification is complete.
license: MIT
compatibility: Git repository; gitmoji CLI is optional.
metadata:
  author: mypac
  stage: shared
---

# Create repository-compliant commits

During an implementation workflow, this skill may load when a coherent slice exists and commit preparation becomes relevant, including before proportionate implementation verification is complete. It may assist with inspecting the slice, verification, staging, hooks, and commit preparation. Exact skill read order is a progressive-context efficiency goal, not a safety or correctness guarantee; avoid loading the procedure before commit work is relevant.

Load this skill immediately for an explicit standalone request whose primary action is Git work on existing changes: commit, split, fixup, amend, reword, or commit planning.

Before running `git commit`, confirm that a coherent slice exists, proportionate verification is complete or the strongest available evidence has been gathered, and commit creation is allowed by repository and user policy. Do not run `git commit` until all three conditions hold.

## Conditional history workflows

For an explicit fixup, amend, autosquash, reword, or other history rewrite request, read and follow [FIXUP.md](FIXUP.md) before acting. Do not read `FIXUP.md` for an ordinary normal implementation commit.

## Resolve applicable policy first

Before applying the procedure below:

1. Consume applicable repository and user policy already available in the session context. Resolve whether Pi may create commits; either source may prohibit agent-created commits or defer them for user review. If commits are prohibited or deferred, do not commit; report the applicable rule and stop before the commit procedure.
2. If a specific required policy value remains unresolved, name that value and perform a targeted read of the smallest authoritative artifact likely to resolve it. Relevant values may include message format, required verification, hooks, signing, issue references, protected branches, and stronger restrictions.
3. Do not broadly re-read `AGENTS.md`, and do not re-read repository policy just because `pac-commit` was loaded.
4. If two authoritative applicable rules still contradict each other, stop the affected operation and ask for resolution. A repository rule that replaces a fallback is not a conflict.

Only when commit creation is allowed, create one atomic, coherent commit per meaningful, verified work slice. Do not make one commit per file or tiny checkbox, and do not batch unrelated work.

## Repository commit policy

- Select the file list explicitly. Stage only the current logical unit and leave unrelated changes, including unrelated already-staged files, out of the commit.
- If changes naturally split into unrelated groups, stop and present the proposed split for approval before committing. Ask if a file's membership is unclear.
- Never commit on the actual default branch or an additional locally protected branch. Create or switch to a branch that follows repository conventions.
- Run proportionate verification plus mandatory repository checks. Never use `--no-verify`. If a hook fails, report the failure and fix it or stop; never bypass it.
- Do not push by default. Push, merge, force-push, and history rewrite each require explicit authorization. Preserve any stronger repository or user restriction or prohibition; for example, a user-only force-push rule remains user-only even after a force-push request.
- Report each created commit's hash and subject, plus files intentionally left unstaged and any reason for stopping.

## Resolve the commit message

Apply this order:

1. Apply explicit user direction together with explicit repository guidance or enforced policy. The repository message format is authoritative and wins over package defaults; if applicable user and repository rules contradict each other, use the conflict rule above.
2. Only when message policy remains unresolved, inspect a small recent-history sample, such as five recent commit subjects. Preserve a clear established convention when one appears; do not inspect broad history by default.
3. If neither source resolves the message, use the mypac gitmoji format as the final fallback below.

### mypac fallback message contract

Use one emoji and one primary purpose:

```text
<emoji> <type>(<scope>): <summary>
```

Scope is optional:

```text
<emoji> <type>: <summary>
```

Example: `✨ feat(auth): Add user authentication system`

- Use a conventional type such as `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf`.
- Keep the optional scope short and lowercase.
- Keep the summary concise, imperative, and without a trailing period.
- Choose the emoji and type for the change's primary impact, not an implementation detail.
- Use a body when needed to explain why, tradeoffs, verification, issue references, or migration notes.
- Do not add sign-offs unless applicable repository policy requires them.

For multiline messages, use multiple `-m` flags or a temporary message file. Never put escaped `\n` sequences inside a quoted `-m` argument.

```bash
git commit \
  -m "✨ feat(scope): Summary" \
  -m "Body paragraph." \
  -m "Verification: npm test"
```

## Issue references

Treat issue association separately from issue closure:

- Never guess an issue number.
- Use a closing keyword only when authoritative evidence shows the completed artifact fully resolves the issue and the repository workflow permits closing references in this commit.
- Otherwise, use the repository's non-closing reference convention, such as `refs #123`, when association is useful; omit a reference if repository policy requires it elsewhere.
- Re-check issue and repository state if verification or hooks mutate files or otherwise change the evidence used for the closure decision.

## Common gitmoji shortlist

- ✨ `feat` — new feature
- 🐛 `fix` — bug fix
- 📝 `docs` — documentation
- ♻️ `refactor` — refactor
- ✅ `test` — tests
- 🔧 `chore` — configuration or tooling
- ⚡️ `perf` — performance
- 🚚 — move or rename files
- 🔥 — remove code or files
- 💄 — UI or style polish
- ⬆️ / ⬇️ — dependency upgrade or downgrade
- 🔒 — security hardening
- 🚑️ — critical hotfix
- 💥 — breaking change; explain required consumer changes in the body

Use the closest match. If none fits and `gitmoji` is installed, `gitmoji list` may provide the full catalog. Do not block a commit because the CLI is unavailable.

## Workflow

1. **Resolve policy and scope**
   - Apply the policy-resolution and commit-permission gate above.
   - Treat explicit paths or globs as the intended scope.
   - Carry an explicitly referenced GitHub issue into planning without assuming it should close.
   - Ask before committing if scope is ambiguous.
2. **Inspect state**
   - Resolve the actual default branch, then run `git branch --show-current`.
   - Run `git status` and the relevant staged and unstaged diffs.
   - Resolve the message with explicit policy first; sample narrow recent history only if still unresolved.
3. **Verify branch safety and grouping**
   - Do not commit on the default or another locally protected branch.
   - Create or switch to a correctly named branch when needed.
   - Group changes into atomic, coherent units. If there is more than one unrelated group, present the split and wait for approval.
4. **Verify and create each approved commit**
   - Stage the file list explicitly for the current unit.
   - Verify the staged file list and diff match the intended scope.
   - Run the smallest relevant verification plus mandatory repository checks not already run.
   - Re-check state if verification mutates files. Commit with the resolved message and issue reference.
   - Let hooks run; never bypass them. Re-check state if a hook mutates files before deciding whether the slice is complete.
5. **Report results**
   - Share each commit hash and subject.
   - Mention intentionally uncommitted files and any reason the work stopped.

## Guardrails

- Do not sweep unrelated changes into the commit.
- Do not guess commit boundaries or issue references.
- Do not infer authorization for push, merge, force-push, or history rewrite from authorization to commit or from one another.
- Keep stronger repository and user restrictions intact.
- Keep atomic grouping, branch, explicit staging, message, hook, and reporting rules intact even when the user casually says “commit this.”
