# Fixup and history-rewrite workflows

Read this reference only for an explicit fixup, amend, autosquash, reword, or other history-rewrite request. Apply the core staging, branch, hook, and reporting rules from `SKILL.md` throughout.

## Safety contract

- A request to create a fixup or amend commit does not authorize autosquash or any other history rewrite.
- Run autosquash or another rewrite only after the user explicitly asks for that rewrite.
- Do not target a commit on the default branch or shared published history without the user's confirmed rewrite intent.
- Never force push or run a force-push command. Publishing rewritten history is a user-only action.
- If the user asks only for a fixup commit, create it, verify it, report it, and stop.

## Fixup commits

Use a fixup when a small correction logically belongs in a known earlier local commit rather than as a standalone commit.

1. Identify and verify the target:

   ```bash
   git log --oneline
   git show --stat <sha>
   ```

2. Stage only the correction and verify the staged diff:

   ```bash
   git add <explicit-files>
   git diff --cached --stat
   git diff --cached
   ```

3. Create the fixup commit and let hooks run:

   ```bash
   git commit --fixup=<sha>
   ```

Git creates `fixup! <exact original subject>` automatically. The usual gitmoji subject format does not apply to this temporary fixup subject.

1. Verify and report the fixup commit:

   ```bash
   git show --stat --oneline HEAD
   git status --short
   ```

Do not autosquash unless separately authorized.

## Rewording with an amend commit

To replace an earlier commit message during a later autosquash, create an `amend!` commit. The subject after `amend!` must exactly match the original subject so autosquash can locate it.

```bash
git commit --allow-empty \
  -m "amend! <exact original subject>" \
  -m "<new desired commit message>"
```

After creating it, report the commit and stop unless the user separately authorized autosquash. Verify the constructed message with `git show -s --format=fuller HEAD`.

## Autosquash

Only after explicit user authorization, rewrite from the target commit:

```bash
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <sha>^
```

`GIT_SEQUENCE_EDITOR=true` accepts Git's generated autosquash plan without opening an editor. Omit it when the user asks to review or edit the rebase plan interactively.

Afterward, verify the rewritten history and worktree:

```bash
git log --oneline
git status --short
```

Do not push. Never force push; if rewritten history must be published, ask the user to do that step.

## Multiple fixups

Multiple fixup commits may be batched before one authorized autosquash:

1. Stage each correction explicitly.
2. Create each fixup against its intended base commit.
3. Report each fixup hash and target.
4. Run one autosquash only after the user explicitly asks.

Keep corrections separate when they target different commits or form different logical units.

## Routing examples

- “Commit this verified feature” → use only `SKILL.md`; do not load this reference.
- “Create a fixup for abc123” → load this reference, create the fixup, then stop.
- “Reword abc123” → load this reference and create an `amend!` commit; do not autosquash without separate authorization.
- “Autosquash these fixups” → load this reference, confirm the target range, then perform the authorized rewrite.
- “Fixup and push it” → create the fixup only; do not autosquash or force push without the distinct required authorization and user-only push step.
