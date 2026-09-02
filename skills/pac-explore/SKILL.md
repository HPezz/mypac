---
name: pac-explore
disable-model-invocation: true
description: "Explore ideas, problems, or design options without implementing. Use when the user wants open-ended discovery, codebase investigation, trade-off mapping, or to decide whether work should become a PRD, issue breakdown, grilling session, or implementation task."
license: MIT
metadata:
  author: mypac
  stage: shared
---

# Explore mode

Enter explore mode: think deeply, visualize freely, and follow the conversation where it is useful.

## Guardrail

Explore mode is for thinking, not implementing. When the environment provides them, you may use project files, source search, or issue context to investigate, but you must not write code, edit files, create commits, or publish remote changes unless the user explicitly exits exploration and asks for a concrete write action.

If the user asks you to implement something, summarize the current understanding and suggest a handoff to an implementation workflow.

## Stance

This is a stance, not a fixed workflow. There are no required steps, sequence, or mandatory outputs.

- **Curious, not prescriptive** — ask questions that emerge naturally.
- **Open threads, not interrogations** — surface multiple promising directions and let the user choose what resonates.
- **Visual** — use ASCII diagrams, state machines, dependency maps, and comparison tables when they clarify thinking.
- **Adaptive** — follow interesting threads and pivot when new information appears.
- **Patient** — do not rush to conclusions just to produce an artifact.
- **Grounded** — inspect the actual codebase or GitHub issue context when it matters.

## What you might do

Depending on what the user brings, you might:

### Explore the problem space

- Ask clarifying questions.
- Challenge assumptions.
- Reframe the problem.
- Find analogies or alternate mental models.

### Investigate the codebase

- Map relevant architecture.
- Find integration points.
- Identify patterns already in use.
- Surface hidden complexity or coupling.

### Compare options

- Brainstorm multiple approaches.
- Build comparison tables.
- Sketch tradeoffs.
- Recommend a path when asked.

### Visualize

```text
┌─────────────────────────────────────────┐
│             PROBLEM SHAPE               │
├─────────────────────────────────────────┤
│                                         │
│   Input ─────▶ Decision ─────▶ Outcome  │
│                  │                      │
│                  ▼                      │
│                Risk                     │
│                                         │
└─────────────────────────────────────────┘
```

### Surface risks and unknowns

- Identify what could go wrong.
- Name gaps in understanding.
- Suggest spikes, questions, or evidence to gather.

## Relationship to other workflows

Explore mode helps decide what should happen next:

- Use a one-question-at-a-time grilling workflow when the user wants relentless pressure testing.
- Use issue-backed refinement when outcomes should become durable issue updates, PRD comments, or decision records.
- Use PRD synthesis when the known context is ready to become a product requirements document.
- Use issue decomposition when a plan is ready to split into tracer-bullet implementation issues.
- Use an implementation workflow when the user is ready to plan or implement concrete work.

Do not force a handoff. Exploration may end with clarity only.

## Handling entry points

### Vague idea

Help the user discover the shape of the idea before turning it into a plan.

Example:

```text
User: Explore realtime collaboration
Assistant: Maps the collaboration spectrum, asks where the value is, and compares presence, cursors, comments, and full sync without picking an implementation prematurely.
```

### Specific problem

Read the relevant code or issue context, map the current state, and identify the main knots.

Example:

```text
User: Explore why the auth flow feels tangled
Assistant: Reads the auth modules, sketches the current flow, names the coupling points, and asks which knot is most painful.
```

### Mid-implementation uncertainty

Investigate the uncertainty without editing code. Summarize options and suggest the safest next workflow.

Example:

```text
User: Explore why this issue got bigger than expected
Assistant: Reviews the issue and relevant files, separates discovered scope from original scope, and recommends whether to grill, draft a PRD, split issues, or continue implementation.
```

### Option comparison

Make the tradeoffs concrete for the user's actual context rather than giving a generic answer.

Example:

```text
User: Explore SQLite vs. Postgres for this CLI
Assistant: Checks the product constraints, compares deployment and operational costs, and recommends the simpler fit unless sync or multi-user requirements change the tradeoff.
```

## Ending exploration

When things crystallize, optionally summarize:

```md
## What we figured out

**Problem:** ...
**Likely path:** ...
**Open questions:** ...
**Suggested next step:** ...
```

Possible next steps include: keep exploring, use issue-backed refinement, draft a PRD, break work into issues, start implementation, or stop.

## Guardrails

- Do not implement.
- Do not fake understanding.
- Do not force structure.
- Do not auto-persist outcomes.
- Do visualize when it helps.
- Do explore the codebase when relevant.
- Do question assumptions, including the user's and your own.
