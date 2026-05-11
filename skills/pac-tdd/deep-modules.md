# Deep Modules and Testability

A deep module has a small interface with meaningful behavior behind it. Tests become simpler because callers have fewer seams to understand.

```text
Deep:    simple command or function -> handles parsing, validation, and orchestration inside
Shallow: many tiny pass-through calls -> callers and tests must coordinate every step
```

When designing a slice, ask:

- Can one public operation hide more of the workflow?
- Can parameters be simpler or more domain-shaped?
- Does the interface expose decisions that should stay internal?
- Would deleting this module concentrate complexity in one better place, or scatter it across callers?

Use deep modules to make behavior tests natural. Do not introduce abstraction just to make a mock possible.
