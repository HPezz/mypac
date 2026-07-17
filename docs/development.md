# Development guide

This guide covers contributor setup and repository maintenance. For package usage, start with the [README](../README.md).

## Prerequisites

The repository uses Node.js, [`mise`](https://mise.jdx.dev/), and Git. On macOS, install mise with:

```sh
brew install mise
```

## Repository setup

From a fresh clone, run:

```sh
./scripts/install.sh
```

The script:

1. installs Node dependencies with `npm ci`;
2. trusts the repository's mise configuration;
3. installs repo-managed tools; and
4. installs Git hooks.

Launch Pi with the local package loaded:

```sh
mise run pi
```

If Pi was already running when package files changed, use `/reload` or restart it.

## Tooling

```sh
mise trust       # trust repository tool configuration
mise install     # install repo-managed tools
mise run hooks   # install Git hooks
mise run lint    # run repository linters
mise run lint:fix
```

The Git hooks lint Markdown and YAML. They also reject merges or pushes to `main` when incoming commits contain `fixup!` subjects. Fix the reported problem rather than bypassing hooks.

## Repository resources

| Path | Contents |
| --- | --- |
| [`extensions/`](../extensions/) | Pi extension entry points and colocated helpers/tests |
| [`prompts/`](../prompts/) | Slash-command prompt templates |
| [`skills/`](../skills/) | Reusable task instructions and supporting references |
| [`personas/`](../personas/) | Persona prompt content loaded by the personas extension |
| [`themes/`](../themes/) | Pi theme definitions |
| [`shared/`](../shared/) | Instructions shared across repository sessions |

Read [`AGENTS.md`](../AGENTS.md) before changing the repository. Specialized authoring guidance lives in:

- [`pac-pi-extension`](../skills/pac-pi-extension/SKILL.md)
- [`pac-pi-prompt`](../skills/pac-pi-prompt/SKILL.md)
- [`pac-pi-skill`](../skills/pac-pi-skill/SKILL.md)

## Git workflow

Keep `main` clean. Work on a branch named:

```text
<firstname>/<type>/<topic-more_info>
```

For issue-backed work, include the issue number:

```text
<firstname>/<type>/<issue-number>-<topic-more_info>
```

Commits use gitmoji subjects:

```text
<emoji> <type>(<scope>): <summary>
```

See [`pac-commit`](../skills/pac-commit/SKILL.md) for staging, commit splitting, and hook guidance.

## Changelog

Record notable changes under `## [Unreleased]` in [`CHANGELOG.md`](../CHANGELOG.md). Keep entries concise and group them under headings such as `Added`, `Changed`, and `Fixed`.

See [`pac-changelog`](../skills/pac-changelog/SKILL.md) for the full workflow.

## Agent-assisted first-time setup

If Pi is already available elsewhere on the machine, this prompt can delegate repository onboarding while preserving existing global settings:

```text
Please set up the `mypac` repository on this machine.

Important:
- Ask for missing values before acting, especially the clone location and
  permission to install prerequisites.
- Do not replace existing entries in ~/.pi/agent/settings.json. Only append the
  cloned repository path to its packages array when missing.
- Stop and explain any authentication, permission, or missing-tool problem.

Tasks:
1. Confirm where to clone https://github.com/ladislas/mypac.git, then clone it.
2. Read README.md and follow the documented repository setup.
3. Ensure ~/.pi/agent/settings.json includes the cloned repository path.
4. From the repository root, run ./scripts/install.sh.
5. Explain how to launch Pi with mise run pi.
6. Ask me to validate the package with /pac-hello-world.
7. Explain whether Pi must be reloaded or restarted.
8. Summarize changes, verification, and follow-up steps.

If mise is missing and I approve installation on macOS, use:
brew install mise
```
