---
name: pac-review-standards-spec
description: "Run an optional Standards + Spec follow-up review after the default pac-review pass. Use when the user asks for a standards review, spec review, or Standards + Spec review of code changes."
license: MIT
compatibility: Git repository; gh CLI required for pull request reviews.
metadata:
  author: mypac
  stage: shared
---

# Standards + Spec Review

Use this skill only as an optional follow-up to the default `pac-review` defect-oriented review pass. Do not replace or weaken the default review rubric.

Keep the results separate from default review findings with these sections:

```md
## Standards Findings
...

## Spec Findings
...
```

## Standards pass

Evaluate whether the diff follows documented repository standards. Look for relevant sources such as:

- `AGENTS.md` and nested agent/instruction files that apply to the changed paths
- `CONTRIBUTING.md`, `CONTEXT.md`, README guidance, and docs that define contributor or project conventions
- ADRs or decision records that constrain the changed area
- Tooling/config files that express repository policy, such as linters, formatters, TypeScript config, test config, CI workflows, package scripts, or dependency policy files

Do not spend findings on rules that machines already enforce unless the diff bypasses or weakens that enforcement. Flag only standards mismatches that are actionable, introduced by the diff, and likely worth fixing.

For each Standards finding, cite the relevant standards source. If no relevant standards source exists, say so and keep the pass brief.

## Spec pass

Evaluate whether the diff matches the originating issue, PRD, ADR, design note, PR description, or user-provided spec.

First identify the best available spec source from the review context, including issue/PR links, `closes #...` references, PR body references, linked PRD comments, ADR comments, or explicit user instructions. Prefer the newest linked PRD/comment that actually contains the expected structured marker when those artifacts exist. Treat ADRs and explicit decisions as constraints.

If no spec source is available, clearly say that and do not invent requirements. If a spec source is stale, unreadable, or missing the expected marker, say so plainly and use the minimum direct context available.

For each Spec finding, cite the spec source and explain the mismatch. Keep Spec findings separate from Standards and default review findings.

## Output

Report Standards and Spec findings separately. Use the same priority tags and finding quality bar as `pac-review`: only flag actionable issues introduced by the reviewed diff that the author would likely fix if aware of them.

If a pass was not possible, say why under that pass heading instead of inventing requirements or standards.
