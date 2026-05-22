# Worktrunk extension

Repo-local Pi extension for creating issue-specific Worktrunk worktrees.

This is intentionally a `mypac` workflow, not a generic Worktrunk wrapper. Worktrunk owns worktree lifecycle behavior; this extension only adds a small Pi command for GitHub issue-backed work.

## Command

```text
/worktree issue <issue-number-or-url>
```

Examples:

```text
/worktree issue 85
/worktree issue https://github.com/ladislas/mypac/issues/85
```

The command:

1. Reads issue metadata with `gh`.
2. Builds a branch name from the issue number and title:

   ```text
   ladislas/feature/<issue-number>-<issue-title-slug>
   ```

3. Lists Worktrunk worktrees with `wt list --format=json`.
4. Reuses the existing worktree if that branch already exists.
5. Otherwise creates one with:

   ```text
   wt switch --create --no-cd --yes <branch>
   ```

6. Prints the issue title, branch, worktree path, and next command:

   ```text
   cd <worktree-path> && pi
   ```

## Setup behavior

The extension does not run project setup commands directly. Setup belongs to Worktrunk hooks so each repository can own its own policy.

For this repo, `.config/wt.toml` defines blocking `pre-start` hooks for new worktrees:

```text
mise trust
mise install
npm ci
```

Because Pi slash commands run non-interactively, the extension passes `--yes` to pre-approve these repo-owned hooks.

## Requirements

- `gh` authenticated for the target GitHub repository
- `wt` installed and configured
- `mise` and `npm` available for this repo's `pre-start` hooks

## Scope

In scope:

- GitHub issue number or issue URL input
- Issue-derived branch names
- Create-or-reuse Worktrunk worktrees
- Clear next-step output for launching Pi manually

Out of scope:

- Launching Pi automatically
- Opening terminal tabs or Zellij panes
- Raw `git worktree` management
- Worktree removal or cleanup flows
- Reimplementing Worktrunk configuration, hooks, or lifecycle behavior
