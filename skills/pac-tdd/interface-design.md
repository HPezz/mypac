# Interface Design for Testability

Design public seams so behavior can be exercised without brittle setup.

Prefer interfaces that:

- accept boundary dependencies instead of creating them internally;
- return explicit results or documented side effects;
- use domain-shaped inputs and outputs;
- keep the surface area small;
- make invalid states hard to represent when practical.

Avoid interfaces that require tests to:

- patch globals or hidden singletons;
- inspect private state;
- coordinate many shallow helper calls;
- know storage details to verify a user-visible result.

## Example shape

```text
GOOD: planRelease({ repo, changelog, version }) -> release plan
GOOD: applyReleasePlan(plan, { git, filesystem }) -> result

BAD: helper calls that expose every intermediate parsing and formatting step as public API
```

The goal is not more interfaces. The goal is one honest seam where tests can prove behavior that matters.
