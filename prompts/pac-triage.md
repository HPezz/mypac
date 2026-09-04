---
description: "Triage GitHub or GitLab issues through mypac's label-based workflow"
argument-hint: "[issue URL | issue number | triage request]"
---

Use the optional argument after `/pac-triage` as the triage request. It may be:

- a GitHub or GitLab issue URL
- an issue number resolved from the current repository forge
- a request such as `show what needs attention`
- a quick state override such as `move #42 to pac:ready_for_agent` or `close #43 as pac:out_of_scope`
- free text describing an issue to classify
- nothing, in which case show issues needing attention

Resolve an explicit URL first, then the current tracking remote, then `origin`; ask rather than guessing if ambiguous. Read and follow `skills/pac-triage/SKILL.md`, and load `skills/pac-gitlab/SKILL.md` only for GitLab.

Use `gh` for GitHub reads and writes and `glab` for GitLab. Before posting comments, changing label assignments, or closing issues, report the concrete action unless the user explicitly requested that exact action. Never mutate an inherited GitLab group label.

**Provided arguments**: $@
