## 1. Rename the shared command surface

- [ ] 1.1 Rename the shared OpenSpec command files from `opsx-*` to `pac-*` so the runtime-visible commands use the new namespace.
- [ ] 1.2 Update command descriptions and in-command cross-references so each renamed command points to the canonical `/pac-*` workflow.

## 2. Align shared references and guidance

- [ ] 2.1 Update shared OpenSpec skill instructions to reference `/pac-*` commands consistently and remove stale `/opsx-*` examples.
- [ ] 2.2 Update local workflow and shared-kit documentation to describe `/pac-*` as the shared command set and narrow the bootstrap exception to agents only.

## 3. Validate namespace and layering behavior

- [ ] 3.1 Search the active shared workflow files for stale `opsx-` references and resolve any remaining mismatches that should be renamed as part of this change.
- [ ] 3.2 Re-run shared-kit discovery/layering checks to verify the shared `/pac-*` commands load cleanly alongside repository-local OpenCode assets without generic command collisions.
