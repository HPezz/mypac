# Guarded downstream Git policy

This file is the complete and current repository policy for this fixture.

- `main` is the default and protected branch. Implementation changes must use `guarded/validate-hook`.
- Pi may create commits after the requested slice passes `node --test`.
- Every commit subject must use `GUARDED: <lowercase imperative summary>` with no emoji or conventional-commit type.
- Partial issue work may use `refs #9001` but must not use a closing keyword.
- Agents must never push this repository. This restriction remains in force even when a user asks or grants push authorization.
- Do not merge or change `main`.
- Hooks are enforcing policy. After committing, re-check repository state and account for hook mutations before reporting completion.
- Do not read this file again: it is already complete and current in the session context.
