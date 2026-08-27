---
description: "Classify work and route it to the next workflow"
argument-hint: "[idea | issue/PR URL | PRD | todo ID | free text]"
---

Let's look at that.

Use this prompt as a lightweight assessment router: classify the target, recommend the next workflow, and stop before implementation. Do not edit files, create commits, run mutating commands, or post GitHub changes.

Start with the provided target only and use the smallest authoritative artifact that can support the next decision. For a GitHub issue or PR URL, read that target first. Do not read issue comments, linked artifacts, `README.md`, `AGENTS.md`, `CONTEXT.md`, or broad code areas by default. Do not load another workflow skill merely because `/pac-llat` may recommend that workflow. Perform one targeted follow-up read only when the current artifact is materially insufficient to classify the work safely.

Process:

1. Resolve the target from the provided argument or current conversation. If it is unclear, ask one concise clarifying question.
2. Summarize the goal, assumptions, and known constraints from the authoritative target.
3. Decide whether the work is:
   - simple and ready for implementation,
   - ambiguous and needs exploration,
   - issue-backed and needs grilling/documented decisions,
   - large enough for a PRD,
   - ready to break into implementation issues,
   - out of scope or not worth doing.
4. Route to existing workflows instead of duplicating them:
   - `/pac-explore` for open-ended discovery,
   - `/pac-grill-me` for conversational design stress-testing,
   - `/pac-grill-with-docs` for issue-backed refinement with durable notes,
   - `/pac-to-prd` for larger product/design artifacts,
   - `/pac-to-issues` for decomposing agreed plans,
   - `/pac-lwot` when the user wants implementation.
5. If the work is ready, produce a short implementation-ready brief: goal, likely files only when known from the target, risks, verification, and open questions. Do not explore the codebase merely to populate speculative details.
6. Stop before implementation and ask what the user wants next.

Keep the response concise. A well-specified target should be classified after its initial read.

**Provided arguments**: $@
