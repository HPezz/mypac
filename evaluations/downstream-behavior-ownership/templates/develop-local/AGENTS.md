# Downstream Git policy

This file is the complete and current repository policy for this fixture.

- `develop` is the default and protected branch. Implementation changes must use `downstream/validate-policy`.
- Pi may create commits after the requested slice passes `node --test`.
- Every commit subject must use `DOWNSTREAM: <lowercase imperative summary>` with no emoji or conventional-commit type.
- Partial issue work must use `Refs #9001`; completed issue work must use `Closes #9001` in the commit body.
- The user authorizes pushing `downstream/validate-policy` for this request. Pushing does not authorize merging; do not merge or change `develop`.
- Do not read this file again: it is already complete and current in the session context.
