# Mocking Guidance

Mock real system boundaries, not your own design.

Good mock targets:

- external APIs and SDK clients;
- email, payment, analytics, and notification services;
- time, randomness, environment, and network boundaries;
- file systems or databases when a real test resource is too slow or unsafe.

Avoid mocking:

- internal collaborators you control;
- private methods;
- modules created only to make assertions convenient;
- behavior that a faster public-interface test can exercise honestly.

## Design boundary interfaces deliberately

Pass boundary dependencies in from the outside so tests can supply fakes without reaching into internals.

```text
GOOD: runSync({ clock, apiClient, workspace })
BAD:  runSync() constructs real clock, client, and workspace internally
```

Prefer specific boundary operations over one generic catch-all function. A fake `getUser(id)` or `sendReceipt(orderId)` is easier to read than a fake `request(url, options)` full of conditional branches.

## Mocking smell test

If changing an internal function name breaks the test while user-visible behavior is unchanged, the mock is probably coupled to implementation details.
