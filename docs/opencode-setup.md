# OpenCode Setup

This repository still supports OpenCode as a reusable shared kit.

## Local workflow in this repository

Use the supported launcher:

```bash
mise run opencode
```

## Reusing this repository from another repository

Point `OPENCODE_CONFIG_DIR` at this repository root:

```bash
export OPENCODE_CONFIG_DIR=/path/to/mypac
```

That loads the shared OpenCode assets from this repository while keeping the target repository's local `.opencode/` content additive.

## Shared OpenCode asset locations

- `agents/`
- `commands/`
- `plugins/`
- `skills/`

Manual `OPENCODE_CONFIG_DIR=... opencode` exports remain useful as compatibility context, but `mise run opencode` is the supported local workflow when working in this repository.

## More details

- Naming and layering rules: `docs/playbooks/shared-opencode-kit.md`
- OpenSpec workflow guidance: `docs/playbooks/openspec.md`
