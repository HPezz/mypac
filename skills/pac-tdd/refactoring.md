# Refactoring After Green

Refactor only after the relevant tests pass.

Look for cleanup that improves locality without expanding scope:

- duplicate logic introduced by the current slice;
- names that now obscure the behavior;
- long functions that can hide complexity behind a clearer public seam;
- shallow pass-through modules that can be removed or deepened;
- tangled setup that makes the next behavior test hard to write.

## Safe loop

```text
1. Confirm tests are green.
2. Make one small refactor.
3. Run the focused tests again.
4. Continue only while behavior stays proven.
```

Do not mix new behavior with refactoring. If a cleanup reveals another feature or bug, capture it as the next slice or a follow-up.
