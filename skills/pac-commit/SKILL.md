---
name: pac-commit
description: Create, split, or plan git commits that follow this repository's commit workflow. Use when the user asks to commit changes directly, split changes into commits, or make an implementation commit along the way.
license: MIT
compatibility: Git repository; gitmoji CLI is optional.
metadata:
  author: mypac
  stage: shared
---

# Create atomic git commits

Use this skill whenever creating or planning commits, including incremental commits during an authorized implementation workflow.

## Conditional history workflows

For an explicit fixup, amend, autosquash, reword, or history rewrite request, read and follow [FIXUP.md](FIXUP.md) before acting. Do not read `FIXUP.md` for an ordinary or normal implementation commit.

## Repository commit policy

- Create one atomic, coherent commit per meaningful, verified work slice. Do not make one commit per file or tiny checkbox, and do not batch unrelated work.
- Select the file list explicitly. Stage only the current logical unit and leave unrelated changes, including unrelated already-staged files, out of the commit.
- If changes naturally split into unrelated groups, stop and present the proposed split for approval before committing. Ask if a file's membership is unclear.
- Never commit on the default branch. Create or switch to a branch that follows repository conventions.
- Never use `--no-verify`. If a hook fails, report the failure and fix it or stop; never bypass it.
- Only commit. Do not push, merge, or rewrite history unless the user explicitly asks.
- Never force push or run a force-push command. Force pushing is user-only; if required, stop and ask the user to perform it.
- Report each created commit's hash and subject, plus files intentionally left unstaged or reasons for stopping.

## Commit message contract

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
- Keep an optional scope short and lowercase.
- Keep the summary concise, imperative, and without a trailing period.
- Choose the emoji and type for the change's primary impact, not an implementation detail.
- Use a body when needed to explain why, tradeoffs, verification, issue references, or migration notes.
- When the task is explicitly tied to a GitHub issue, add `closes #<issue-number>` to the resolving commit body. Do not guess issue numbers.
- Do not add sign-offs.

For multiline messages, use multiple `-m` flags or a temporary message file. Never put escaped `\n` sequences inside a quoted `-m` argument.

```bash
git commit \
  -m "✨ feat(scope): Summary" \
  -m "Body paragraph." \
  -m "Verification: npm test" \
  -m "closes #123"
```

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

1. **Determine scope**
   - Treat explicit paths or globs as intended scope.
   - Carry an explicitly referenced GitHub issue into commit planning.
   - Ask before committing if scope is ambiguous.
2. **Inspect state**
   - Run `git branch --show-current`.
   - Run `git status` and the relevant staged and unstaged diffs.
   - Inspect recent subjects only when useful for local conventions.
3. **Verify branch safety**
   - Do not commit on the default branch.
   - Create or switch to a correctly named branch when needed.
4. **Choose grouping**
   - Group changes into atomic, coherent units.
   - If there is more than one unrelated group, present the split and wait for approval.
5. **Create each approved commit**
   - Stage the file list explicitly for the current unit.
   - Verify the staged file list and diff match the intended scope.
   - Run the smallest relevant verification if it has not already run.
   - Commit with the required message format and issue-closing body when applicable.
   - Let hooks run; never bypass them.
6. **Report results**
   - Share each commit hash and subject.
   - Mention intentionally uncommitted files or any reason work stopped.

## Guardrails

- Do not sweep unrelated changes into a commit.
- Do not guess commit boundaries or issue references.
- Do not push by default.
- Never force push.
- Keep the atomic grouping, branch, explicit staging, message, hook, and reporting rules intact even when the user casually says “commit this.”
