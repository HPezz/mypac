---
description: "Address GitHub Copilot PR review comments with explicit fixup commits"
argument-hint: "[PR URL | PR number | current PR]"
---

Handle GitHub Copilot review comments on a pull request.

Use the optional argument after `/pac-fix-copilot-review` as the target PR. It may be:

- a GitHub PR URL
- a PR number
- nothing, in which case infer the PR for the current branch with `gh`

## Behavior

1. **Identify the target PR**
   - Resolve the PR number, repository, branch, title, and state.
   - If no PR can be identified, ask for the PR URL or number.
   - If the PR is closed or merged, stop unless the user explicitly asks to inspect it anyway.

2. **Check local and GitHub safety**
   - Check the current git branch and working tree before editing.
   - Do not switch branches, rebase, force-push, merge, or autosquash unless the user explicitly asks.
   - Confirm that local changes, if any, are relevant before modifying files.
   - Avoid unrelated review comments, unrelated files, and drive-by refactors.

3. **Fetch Copilot review comments**
   - Use `gh` to read PR review comments, review threads, and relevant review metadata.
   - Filter to comments authored by `copilot-pull-request-reviewer[bot]` only.
   - Ignore comments from humans and other bots unless the user explicitly asks to include them.
   - Prefer unresolved or open Copilot threads. If a Copilot comment is already resolved, note it and do not change code for it unless still relevant.
   - Summarize the Copilot comments to be addressed before making changes.

4. **Plan fixes**
   - Map each Copilot comment to the smallest code change that resolves it.
   - State assumptions and any comments you believe should not be changed, with rationale.
   - Ask for confirmation before implementation unless each requested fix is a single-line change with no behavior impact and no new imports.

5. **Implement fixes**
   - Make minimal changes directly tied to Copilot comments.
   - Match existing style and avoid unrelated cleanup.
   - If a fix changes runtime behavior or fixes a bug, read and follow `skills/pac-tdd/SKILL.md` before implementing that slice.
   - Run the smallest relevant verification for each coherent fix or batch.

6. **Commit as explicit fixup commits**
   - Create one or more explicit `fixup!` commits for completed fixes.
   - Target the relevant existing commit subject when it is clear.
   - If the correct target commit is unclear, stop and ask rather than guessing.
   - Do not run autosquash.
   - Do not rewrite history.

7. **Resolve Copilot comments after fixes**
   - After a fix is committed and verified, resolve or close the corresponding Copilot review thread/comment through GitHub.
   - Only resolve comments that were actually addressed.
   - Do not resolve human comments or unrelated bot comments.
   - If GitHub does not permit resolving a comment, report the exact comment URL and reason.

8. **Report results**
   - List each Copilot comment, the fix made, verification run, commit hash, and whether the thread/comment was resolved.
   - Note any skipped comments and why.
   - Mention that autosquash was not run.

## Examples

- `/pac-fix-copilot-review https://github.com/owner/repo/pull/123`
- `/pac-fix-copilot-review 123`
- `/pac-fix-copilot-review`

**Provided arguments**: $@
