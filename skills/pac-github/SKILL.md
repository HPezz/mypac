---
name: pac-github
description: "Handle non-trivial GitHub operations with `gh`, including advanced API queries, CI investigation, reviews, labels, comments, and state changes. Use when GitHub-specific instructions materially help; a simple known-target issue or PR read does not require this skill."
license: MIT
compatibility: Git repository; gh CLI required.
metadata:
  author: mypac
  stage: shared
---

# GitHub Skill

Use `gh` for non-trivial GitHub operations where specialized instructions add value. A simple read of a known issue or PR does not require loading this skill. Always specify `--repo owner/repo` when not in a git directory, or use URLs directly.

## Pull Requests

Check CI status on a PR:

```bash
gh pr checks 55 --repo owner/repo
```

List recent workflow runs:

```bash
gh run list --repo owner/repo --limit 10
```

View a run and see which steps failed:

```bash
gh run view <run-id> --repo owner/repo
```

View logs for failed steps only:

```bash
gh run view <run-id> --repo owner/repo --log-failed
```

## API for Advanced Queries

The `gh api` command is useful for accessing data not available through other subcommands.

Get PR with specific fields:

```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON Output

Most commands support `--json` for structured output.  You can use `--jq` to filter:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```
