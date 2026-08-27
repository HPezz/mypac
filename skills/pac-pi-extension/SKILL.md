---
name: pac-pi-extension
description: "Create or refactor a Pi extension safely. Use when starting new extension work, adding helper modules to an existing extension, or colocating tests. Covers layout, modularization, tests, and CI alignment."
license: MIT
compatibility: Pi coding agent; Node.js project with npm test / npm run typecheck.
metadata:
  author: mypac
  stage: shared
---

# Create or refactor a Pi extension safely

Load this skill whenever you are about to:

- Create a new Pi extension
- Add a helper module or test to an existing extension
- Refactor extension code that currently lives at `extensions/` top level

## Process

1. **Gather requirements**
   - What surface are you adding or changing: command, tool, hook, UI, or background behavior?
   - Is this a trivial single-file extension, or should it be a directory-based extension?
   - What support modules or tests should be colocated with it?
2. **Inspect and verify the API surface**
   - When modifying an extension, inspect the existing extension implementation and focused tests first.
   - Identify the concrete Pi API or TUI surface involved in the requested behavior.
   - Verify that surface progressively against the installed pinned-version docs and examples before implementing.
3. **Choose the layout**
   - Default to a dedicated directory for anything non-trivial.
   - Keep support files inside the extension directory.
4. **Implement carefully**
   - Keep the entrypoint focused on extension wiring as much as practical.
   - Move parsing, rendering, state, or other reusable logic into sibling modules when that keeps the change local and easier to test.
5. **Verify the result**
   - Run the relevant tests, then run `npm test` and `npm run typecheck` before finishing meaningful extension work.

## The core hazard

Pi auto-discovers every `.ts` or `.js` file directly under `extensions/` and loads it as an extension entrypoint. This means:

> What is safe in a normal TypeScript project — extracting a helper file — is **unsafe** if that file lands at `extensions/` top level.

The broken layout looks perfectly reasonable. That is why this skill exists.

## Layout rules

### Single-file extension (trivial only)

Use a top-level entrypoint file only when the extension fits entirely in one file and has no helpers or tests:

```text
extensions/answer.ts
extensions/answer.js
```

### Multi-file extension (default for anything non-trivial)

Use a dedicated directory. The entrypoint must be `index.ts` or `index.js`:

```text
extensions/<name>/index.ts          ← entrypoint, loaded by Pi (or index.js)
extensions/<name>/helper.ts         ← safe sibling, not auto-discovered
extensions/<name>/helper.test.mjs   ← test, colocated
```

Never place helpers or tests directly under `extensions/`.

## When to split modules

Split logic into sibling modules when:

- the entrypoint starts mixing wiring with parsing, state, rendering, or prompt-building logic
- a pure helper can be tested in isolation
- the same logic would otherwise be duplicated inside handlers or hooks

Do not split files just for ceremony. The goal is to keep changes local and easy to understand.

## Tests

- **Colocate tests** inside the extension directory, not in a separate top-level folder.
- Name test files so Node's test runner discovers them (for example `*.test.mjs`).
- Add or update focused tests when extracting helper logic or changing non-trivial behavior.
- Run the full suite before and after meaningful extension changes:

  ```bash
  npm test
  npm run typecheck
  ```

## Verify against the installed Pi package version progressively

Patterns in Pi evolve. The installed pinned-version Pi docs and examples are the authoritative source for Pi APIs; do not rely on memory.

Before locking in imports or API usage:

1. For an existing extension, inspect its implementation and focused tests before opening broad API documentation.
2. Identify the concrete Pi API or TUI surface the change needs.
3. Search the installed package for that surface. Use matching line numbers to read a narrow surrounding range, or open the one specific example that demonstrates it.
4. Do not begin a documentation check by reading an entire documentation file. Prefer targeted searches, specific sections, and specific examples.
5. Read TUI documentation only when the task actually touches TUI behavior. An established local TUI pattern does not by itself require broad TUI documentation; verify only the changed or ambiguous Pi API.
6. Expand to broader documentation only when the targeted material is insufficient and the API behavior remains ambiguous. Reading sequential ranges that cover a file is a whole-document read, not targeted reading.
7. Before any whole-file fallback, state the concrete unresolved API question and why the targeted evidence failed to answer it. Without both, do not broaden the read.
8. Verify which packages and imports are canonical for that installed version.

Treat upstream `pi-mono` as an optional cross-check only for an intentional upgrade-oriented comparison. Use the `pac-librarian` skill to cache it only for that case.

Implement only after confirming the relevant patterns match the version pinned in this repo. Full documentation reads remain appropriate for broad, unfamiliar work when targeted evidence cannot resolve the API behavior.

## Checklist before committing extension work

- [ ] No new `.ts` or `.js` files created directly under `extensions/` that are not real entrypoints
- [ ] Multi-file extensions use `extensions/<name>/index.ts` or `extensions/<name>/index.js`
- [ ] Helper modules live inside `extensions/<name>/`
- [ ] Tests are colocated inside `extensions/<name>/`
- [ ] Entry-point changes keep wiring and reusable logic separated as much as practical
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] Imports verified against the docs/examples for the installed Pi package version in this repo
