# Behavior-First Tests

Prefer tests that describe what callers can observe through a public interface.

Good tests:

- exercise the same seam a caller, command, hook, or user workflow uses;
- describe the behavior in the test name;
- assert outcomes, returned values, rendered state, emitted files, or documented side effects;
- survive internal refactors when behavior stays the same;
- keep each test focused on one behavior.

Avoid tests that mainly verify implementation mechanics:

- private methods or unexported helpers;
- call counts or call order between internal collaborators;
- internal data structures that callers cannot observe;
- snapshots of broad incidental output;
- database or file-system inspection when a public read path exists.

## Example

```text
GOOD: "create user makes the user retrievable by id"
  createUser(input)
  getUser(result.id) returns the created user's public fields

BAD: "create user calls userRepository.insert once"
  assert internal collaborator calls instead of observable behavior
```

## Tactical internal tests

Internal unit tests are allowed when behavior-level coverage is impractical or would be dishonest. Use them for dense pure logic, legacy seams, or failure cases that cannot be reached through the public surface without brittle setup. State the rationale, and keep the public behavior test as the preferred target when the seam improves.
