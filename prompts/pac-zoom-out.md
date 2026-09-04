---
description: "Zoom out from a code area and map relevant modules and callers"
argument-hint: "[code area | issue/PR URL | todo ID | free text]"
---

Read and follow `skills/pac-zoom-out/SKILL.md`. When `CONTEXT.md` is present, treat it as the source of truth for project vocabulary.

Use the optional argument as the area to map. It may be a file, directory, symbol, feature area, free-form description, GitHub issue/PR URL, GitLab issue/MR URL, or todo ID. Resolve forge URLs through `gh` or `glab`, using provider-native terminology and loading `skills/pac-gitlab/SKILL.md` only for GitLab. If omitted, infer the area from the conversation and ask only if unclear.

**Provided arguments**: $@
