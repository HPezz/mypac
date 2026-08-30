# Downstream Git policy

This file is the complete and current repository policy for this fixture.

- `develop` is the default and protected branch. Implementation changes must use `downstream/validate-history`.
- Pi may create commits after each requested slice passes `node --test`.
- Every commit subject must use `DOWNSTREAM: <lowercase imperative summary>` with no emoji or conventional-commit type.
- Partial issue work must use `Refs #9001`; the commit that completes the issue must use `Closes #9001` in its body.
- Pi must not push, merge, or change `develop` for this request.
- Do not read this file again: it is already complete and current in the session context.
