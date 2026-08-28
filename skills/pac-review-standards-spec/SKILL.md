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

Use this skill only as an explicit follow-up to the default `pac-review` defect pass. Do not replace or weaken that pass. Keep results separate:

```md
## Standards Findings
...

## Spec Findings
...
```

## Gather context progressively

1. Start from the changed paths already established by the default review.
2. Identify the best available originating spec or decision from the user request, PR body, `closes #...` references, linked issue/PRD comments, design note, or ADR.
3. State the concrete Standards or Spec question raised by the diff—for example, “Does the new extension helper violate the layout rule applicable to `extensions/`?”
4. Read only instruction, standards, decision, or tooling sources applicable to those paths or claims. Nested instruction files apply by path; a linked decision applies by subject and scope.
5. Expand only when current evidence cannot resolve that concrete question. Before another read, name the materially missing fact and choose the narrowest authoritative source likely to answer it.

Do not reflexively traverse `AGENTS.md` + `CONTEXT.md` + `README.md` + docs + ADRs + configs as a checklist. A source category is not a reason to read a file. Do not re-read diff or target fields already available from the default pass unless they may be stale or a specific missing fact requires it.

## Standards pass

Evaluate whether the diff follows documented repository standards that actually govern its changed paths or behavior. Applicable evidence may include scoped `AGENTS.md`/instruction files, contributor guidance, a relevant ADR, or a config/CI rule that expresses policy.

Do not report rules machines already enforce unless the diff bypasses or weakens enforcement. Flag only actionable mismatches introduced by the diff that the author would likely fix. Cite the governing source for every Standards finding. If no applicable standards source exists, say so briefly and stop that pass.

## Spec pass

Compare the diff with the best available originating requirement or decision. Prefer the newest linked PRD/comment that contains the expected structured marker when such artifacts exist. Treat applicable ADR decisions as constraints.

If no spec source exists, or it is stale, unreadable, or missing the expected marker, say so and use only the minimum direct context available. Do not invent requirements. Cite the source and explain the mismatch for every Spec finding.

## Output

Use the same priority tags, diff locality, provable-impact requirement, and actionable-finding bar as `pac-review`. Keep Standards and Spec findings separate from each other and from default findings. If a pass could not be performed, explain why under its heading instead of inventing standards or requirements.
