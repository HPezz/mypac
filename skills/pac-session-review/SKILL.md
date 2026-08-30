---
name: pac-session-review
disable-model-invocation: true
description: "Review one explicitly selected Pi session for actionable setup friction. Use only when invoked through /pac-session-review."
license: MIT
compatibility: Pi coding agent
metadata:
  author: mypac
  stage: shared
---

# Explicit session review

Review sessions only after the user explicitly invokes this workflow. Metadata-only discovery comes first; keep raw session content local and disclose progressively.

## Workflow

1. **Discover metadata first.** If the target is not already one unambiguous JSONL file, call `discoverPiSessions` from `lib/pi-session-discovery.ts` with the configured session root and repository filter. Show only a small recent list: timestamp, session ID, message count, cwd/repository, malformed-line count, and file path. Do not inspect or expose prompts, responses, or tool contents yet.
2. **Select one session.** Continue with one selected session. Ask the user when metadata does not identify one clear target. Do not bulk-read transcripts or compare full session contents.
3. **Extract bounded events.** Invoke `parseCompactPiSessionEvents` from `lib/pi-session-telemetry.ts` through Node's TypeScript stripping mode for the selected path. Never call the `read` tool on session JSONL and never print the file before parsing it. The parser's compact default window returns at most 24 events with 240 characters per event. Inspect user text summaries, compact tool arguments/results, call/result linkage, structural failure state, aborts, ordering, and truncation.
4. **Expand only when needed.** Targeted expansion is allowed only for a specific missing event or authoritative artifact. Reuse the selected metadata file path for every window; do not substitute the reviewing session's `PI_SESSION_FILE`. For a later event window, pass the chosen sequence as `startSequence`; the parser emits that bounded window without preceding events and returns `nextStartSequence` when more remain. Do not load the full raw transcript merely for completeness.
5. **Classify evidence.** Distinguish actionable friction from normal exploration, red-green TDD failures, diagnosis probes, environment discovery, expected negative checks, and weak one-off model variance. A failed command alone is not actionable evidence.
6. **Verify current state.** Before recommending a change, inspect the current authoritative artifact that would own the behavior. Check a small relevant recurrence sample only when recurrence materially affects the decision. Historical friction already fixed by current guidance is a no-change outcome.
7. **Route through #411 ownership.** Assign a supported finding to exactly the narrowest appropriate owner: shared guidance for universal safety floors; repository policy for local invariants; skills for procedures; prompts for routing; deterministic tooling/hooks for mechanically enforceable behavior; conditional support for uncommon detail; or **no change** when evidence is weak or guidance is already correct.
8. **Report concisely.** Include evidence, normal-vs-actionable classification, current-state check, owner, recommendation or no-change result, and confidence. Never publish raw transcript content by default.

Use the shared libraries directly rather than recreating JSONL parsing. Metadata discovery should import `discoverPiSessions`. Selected-session inspection should use a narrowly quoted inline Node invocation that reads the path internally and prints only the return value of `parseCompactPiSessionEvents`; do not use shell `cat`, `head`, `grep`, or the `read` tool on session JSONL.

`pac-eval` is an optional downstream escalation only when an approved recurring behavior change needs controlled before/after validation. Do not invoke it automatically and do not use it as a parser or mandatory review step.

## Example

`/pac-session-review ~/…/2026-05-20T10-00-00-000Z_session.jsonl` reviews that one file with bounded events, verifies any candidate against current ownership artifacts, and may conclude **no change**.
