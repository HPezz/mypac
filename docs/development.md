# Development guide

This guide covers contributor setup and repository maintenance. For package usage, start with the [README](../README.md).

## Prerequisites

The repository uses Node.js, [Pi](https://github.com/earendil-works/pi), [`mise`](https://mise.jdx.dev/), and Git. On macOS, install mise with:

```sh
brew install mise
```

## Repository setup

From a fresh clone, run:

```sh
./scripts/install.sh
```

The script checks for mise and delegates to `mise run bootstrap`, which:

1. verifies Pi is available;
2. installs Node dependencies with `npm ci`;
3. installs checkout-local mise tools;
4. installs Git hooks; and
5. runs `mise run sync` to reconcile the pinned global environment.

Current mise behavior auto-trusts the active configuration for explicit `mise run` and `mise install` commands, so no separate pre-trust step is required.

Launch Pi with the local package loaded:

```sh
mise run pi
```

If Pi was already running when package files changed, use `/reload` or restart it.

## Tooling

```sh
mise install     # install checkout-local development tools
mise run sync    # reconcile the checked-in global environment
mise run hooks   # install Git hooks
mise run lint    # run repository linters
mise run lint:fix
npm run check:pi-compatibility # verify pinned Pi versions, types, and behavior
```

Global desired state lives in [`.mise/global-environment`](../.mise/global-environment). Change its exact package specification, commit it, and rerun `mise run sync` to apply an upgrade or downgrade. Removing a declaration stops future reconciliation but does not uninstall the existing global component.

Responsibility is intentionally split between native managers:

```text
mise  → globally required CLI tools, including Python CLIs through pipx
uv    → mypac Python workflows and mise's pipx installation backend
Pi    → globally required Pi packages
npm   → mypac checkout dependencies
mypac → desired-state declaration and thin orchestration
```

CI runs the Pi compatibility gate after `npm ci`, so its version, type, and behavior checks execute against a clean dependency installation. Run the same command locally before upgrading Pi dependencies.

## Pi upgrade checklist

Use this checklist whenever changing the pinned Pi version:

1. Record the old pin, target pin, and exact repository commit being audited.
2. List every intervening stable Pi release. Review each release changelog and inspect versioned documentation, types, examples, or source where the changelog does not establish impact.
3. Maintain a release ledger that classifies every release, including releases with no applicable mypac changes.
4. Map relevant changes to affected extensions, skills, prompts, themes, package metadata, and tests. Classify each response as migration, replacement, improvement, verification only, or not applicable.
5. Create capability-based implementation issues with explicit dependencies for the agreed work. Keep the upgrade branch pinned to exact Pi and TypeBox versions.
6. Install dependencies cleanly and run `npm run check:pi-compatibility`. Add focused regression coverage for every compatibility defect found.
7. Run focused manual checks for behavior that automation cannot approve: regular and fullscreen rendering, themes, overlays, scrolling, focus, resize, shortcuts, provider routing, notifications, reload, session replacement, trust, and shutdown.
8. Record the effective dependency versions, automated result, test environment, manual observations, follow-up issues, and exact implementation commit.
9. Compare the audited commit with current `main`. Review intervening changes and rerun affected automated or manual checks when runtime, dependency, configuration, or test behavior changed.
10. Obtain explicit human approval before merging or declaring the upgrade complete.

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
- Stop and explain any authentication, permission, or missing-tool problem.

Tasks:
1. Confirm where to clone https://github.com/ladislas/mypac.git, then clone it.
2. Read README.md and follow the documented repository setup.
3. From the repository root, run ./scripts/install.sh.
4. Explain how to launch Pi with mise run pi.
5. Ask me to validate the package with /pac-hello-world.
6. Explain whether Pi must be reloaded or restarted.
7. Summarize changes, verification, and follow-up steps.

If mise is missing and I approve installation on macOS, use:
brew install mise
```
