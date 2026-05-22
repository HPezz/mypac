# Worktrunk extension

Repo-local Pi extension for focused Worktrunk workflows.

This is intentionally a `mypac` workflow, not a generic Worktrunk wrapper. Worktrunk owns worktree lifecycle behavior; this extension only adds small Pi shortcuts for routine worktree discovery and creation.

## Commands

### Issue worktrees

```text
/worktree issue <issue-number-or-url>
```

Examples:

```text
/worktree issue 85
/worktree issue https://github.com/ladislas/mypac/issues/85
```

The command:

1. Shows progress while it reads issue metadata with `gh`.
2. Builds a branch name from the issue number and title:

   ```text
   ladislas/feature/<issue-number>-<issue-title-slug>
   ```

3. Shows progress while it lists Worktrunk worktrees with `wt list --format=json`.
4. Reuses the existing worktree if that branch already exists.
5. Otherwise creates one with:

   ```text
   wt switch --create --no-cd --yes <branch>
   ```

6. Prints the issue title, branch, worktree path, and next command in a Markdown code block:

   ```sh
   cd <worktree-path> && pi '/pac-lwot <issue-number-or-url>'
   ```

### Explicit branch worktrees

```text
/worktree branch <branch>
```

Creates or reuses a Worktrunk worktree for an explicit branch name.

The command delegates to Worktrunk:

```text
wt switch --create --no-cd --yes <branch>
```

It prints the branch, worktree path, and next command:

```text
cd <worktree-path> && pi
```

### List worktrees

```text
/worktree list
/worktree ls
```

Delegates to:

```text
wt list --format=json
```

The output shows each Worktrunk worktree branch, path, and copy/paste command:

```text
cd <worktree-path> && pi
```

### Current status

```text
/worktree status
```

Delegates to `wt list --format=json` and renders the current Worktrunk worktree, including branch/path, main or remote relation when present, commit summary, and dirty-state flags.

## Setup behavior

The extension does not run project setup commands directly. Setup belongs to Worktrunk hooks so each repository can own its own policy.

For this repo, `.config/wt.toml` defines blocking `pre-start` hooks for new worktrees:

```text
mise trust
mise install
npm ci
```

Because Pi slash commands run non-interactively, create commands pass `--yes` to pre-approve these repo-owned hooks.

## Requirements

- `gh` authenticated for the target GitHub repository when using `/worktree issue`
- `wt` installed and configured
- `mise` and `npm` available for this repo's `pre-start` hooks

## Scope

In scope:

- GitHub issue number or issue URL input
- Issue-derived branch names
- Explicit branch input
- Create-or-reuse Worktrunk worktrees
- Listing Worktrunk worktrees
- Current Worktrunk worktree status
- Clear next-step output for launching Pi manually

Out of scope:

- Launching Pi automatically
- Opening terminal tabs or Zellij panes
- Raw `git worktree` management
- Worktree removal or cleanup flows
- Reimplementing Worktrunk configuration, hooks, or lifecycle behavior
