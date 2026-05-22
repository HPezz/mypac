# Review Summary Prompt

We are leaving a code-review session and returning to the main coding session.
Create a structured handoff that can be used immediately to implement fixes.

You MUST summarize the review that happened in this session so findings can be acted on.
Do not omit findings: include every actionable issue that was identified.

If the session included multiple review passes (for example a default review plus Standards and Spec follow-up passes), preserve those findings in separate sections. Do not flatten Standards or Spec findings into the default findings.

Required sections (in order):

## Review Scope

- What was reviewed (files/paths, changes, and scope)

## Verdict

- "correct" or "needs attention"

## Default Review Findings

Include findings from the default defect-oriented review pass. For EACH finding, include:

- Priority tag ([P0]..[P3]) and short title
- File location (`path/to/file.ext:line`)
- Why it matters (brief)
- What should change (brief, actionable)

If no default findings were identified, write "- (none)".

## Standards Findings

Include findings from any Standards follow-up pass separately from default review findings. If no Standards pass occurred, write "- Not run." If it ran and found no issues, write "- (none)".

For EACH Standards finding, include the same finding fields as above plus the relevant standards source when available.

## Spec Findings

Include findings from any Spec follow-up pass separately from default review findings. If no Spec pass occurred, write "- Not run." If it ran and found no issues, write "- (none)".

For EACH Spec finding, include the same finding fields as above plus the spec source when available. If the Spec pass could not identify a source, preserve that note.

## Combined Fix Queue

1. Ordered implementation checklist across all findings (highest priority first)

## Constraints & Preferences

- Any constraints or preferences mentioned during review
- Or "(none)"

## Human Reviewer Callouts (Non-Blocking)

Include only applicable callouts (no yes/no lines):

- **This change adds a database migration:** `files/details`
- **This change introduces a new dependency:** `package(s)/details`
- **This change changes a dependency (or the lockfile):** `files/package(s)/details`
- **This change modifies auth/permission behavior:** `what changed and where`
- **This change introduces backwards-incompatible public schema/API/contract changes:**
  `what changed and where`
- **This change includes irreversible or destructive operations:** `operation and scope`
- **This change adds or removes feature flags:** `feature flags changed` (call out re-use of dormant feature flags!)
- **This change changes configuration defaults:** `config var changed`

If none apply, write "- (none)".

These are informational callouts for humans and are not fix items by themselves.

Preserve exact file paths, function names, and error messages where available.
