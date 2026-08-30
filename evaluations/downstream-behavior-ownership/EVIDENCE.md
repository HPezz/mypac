# Downstream behavior-ownership validation

This ledger separates durable static proof from disposable fresh-session evidence. Generated repositories, manifests, transcripts, and reports stay outside this repository.

The accepted [#411 activation-timing ADR](https://github.com/ladislas/mypac/issues/411#issuecomment-5467272003) supersedes exact `pac-commit` read-order gating. Read order is an efficiency observation, not a pass/fail criterion. The safety gate applies before `git commit`: a coherent slice must exist, proportionate verification must be complete or the strongest available evidence gathered, and repository/user permission must allow commit creation.

## Evidence matrix

| Claim | Proof type | Evidence |
|---|---|---|
| `main` default branch with no local Git policy uses the mypac fallback | Static and fresh-session | The fixture has no `AGENTS.md`; its verifier requires a non-default branch and the mypac message pattern. The corrected post-#426 natural-language run passed with `🔧 chore: Complete task state`, kept only `main` on the disposable remote, and used `Refs #9001` in the partial commit body. |
| `develop` default branch with explicit local branch/message policy uses local policy | Static and fresh-session | Fixture policy requires `downstream/validate-policy` and `DOWNSTREAM:` subjects. The corrected post-#426 complete `/pac-lwot` run passed with `DOWNSTREAM: complete requested task`, `Closes #9001` in the commit body, only the authorized feature branch pushed, and `develop` left at the baseline. |
| Stronger local restriction and mutating hook survive | Static and fresh-session | Guarded policy forbids agent pushes even when the prompt grants authorization. The committed hook stages `hook-state.txt=checked`. The fresh run passed the verifier, kept only `main` on the remote, committed the hook mutation, and rechecked status afterward. |
| Natural-language and `/pac-lwot` entry paths are covered | Static and fresh-session | The generated matrix contains two natural-language and two `/pac-lwot` runs, with exactly one profile/scenario each and no Cartesian expansion. The three closure-focused scenarios produced the requested committed slices; guarded-hook evidence is reused. |
| Complete issue-backed commits close by default without PR-body dependence | Static and fresh-session | The single-complete `/pac-lwot` verifier requires `Closes #9001` in the commit body, pairs it with a minimal user PR body containing no issue link, synthesizes a merge commit, and proves the closing commit remains in merged history. |
| Partial issue-backed work does not close automatically | Static and fresh-session | Partial fixture verifiers require `Refs #9001` in commit and generated PR bodies and reject closing keywords. The corrected post-#426 natural-language run passed that contract. |
| Multi-commit issue work closes only on the completing commit | Static and fresh-session | The multi-commit `/pac-lwot` verifier requires exactly two commits in order: the first body uses `Refs #9001`, the second uses `Closes #9001`. It also proves a minimal user PR body without issue links retains closure through merged commit history. |
| Commit, push, and merge authorization remain independent | Static and fresh-session | Main fallback committed without pushing; develop pushed only after explicit authorization and did not merge; guarded did not push because stronger local policy overrode prompt-level authorization. No session performed a merge. |
| Complete/current `AGENTS.md` is not redundantly re-read | Fresh-session plus reused #366 baseline | Explicit `AGENTS.md` read count was zero in all three post-#420 sessions. #366 already proves `AGENTS.md` is automatically loaded repository context. |
| Actual commit creation is gated on slice, evidence, and permission | Static and fresh-session | `pac-commit` and `/pac-lwot` statically require the three-part pre-commit gate. Existing traces show implementation and evidence before `git commit`, with permission supplied by prompt/repository policy; detailed sequences follow. |
| `pac-commit` read timing remains progressive | Static and observational | Product contracts call exact read order an efficiency goal rather than a safety guarantee. The traces retain read positions for context analysis without treating an earlier read as failure. |

## Fresh-session proof

The single-complete `/pac-lwot`, partial natural-language, and partial-then-complete `/pac-lwot` cases were rerun after the #426 contract correction with `openai-codex/gpt-5.6-luna`, medium thinking, and Pi 0.84.3. The guarded-hook result remains reused because #426 does not change hook or push-authorization behavior. Raw corrected evidence remains under `/tmp/mypac-downstream-behavior-426-corrected/results/` and is not committed.

High-level read/tool sequence:

| Run | Commit-gate evidence | Relevant sequence |
|---|---|---|
| `main-fallback` (natural language) | Prompt allowed a verified commit; the exact task edit formed the coherent slice; the fixture declared the issue work partial | implementation and verification → read `pac-commit` → commit body with `Refs #9001` → PR body with `Refs #9001` → full verifier and status check |
| `develop-local` (`/pac-lwot`) | Repository policy allowed commits and required `node --test`; the request explicitly said the completed edit fully resolves issue #9001 | edit → `node --test` → read `pac-commit` → commit body with `Closes #9001` → authorized push without merge → minimal-user-PR merge verifier |
| `multi-commit-local` (`/pac-lwot`) | The request explicitly split issue #9001 into an intermediate slice and a completing slice, each independently verified | first edit and verification → first commit with `Refs #9001` → second edit and verification → completing commit with `Closes #9001` → minimal-user-PR merge verifier |
| `guarded-hook` (natural language, reused) | Repository policy allowed commits but prohibited pushes; the completed edit passed `node --test` before commit | edit (14) → `node --test` (15) → read `pac-commit` (16, informational) → diff, scoped stage, `git commit`, and hook mutation (17) → verifier and post-hook status recheck (18–20) |

The sequences prove the amended safety boundary before `git commit` while preserving progressive-context observations. No new product-behavior gap appears under the accepted ADR.

## Static proof

- `shared/shared-guidance.test.mjs` locks universal default-branch and per-operation authorization floors while excluding repository-specific message and merge policy.
- `skills/pac-commit/skill.test.mjs` locks local message-policy precedence, mypac fallback, stronger restrictions, completing-commit closure, partial and multi-commit association, PR-body independence, post-hook state rechecks, and the three-part pre-commit gate.
- `scripts/workflow-routing.test.mjs` locks `/pac-lwot` policy reuse, complete/current `AGENTS.md` non-rereads, progressive read-order semantics, pre-commit verification/evidence and permission, and independent push/merge authorization.
- `evaluation.test.mjs` locks the disposable fixture shapes, the three-run natural-language/`/pac-lwot` matrix, ownership contracts, and this evidence classification.

## Reused #366 evidence

The closing evidence on #366 audited model-visible context in isolated fresh processes and found `AGENTS.md` was the only automatically loaded repository document. It also established that paid E2E should not be repeated when current static coverage or durable fresh-session evidence already proves a claim. #415 reuses that automatic-loading baseline and the unaffected policy outcomes from valid prior fixture runs.

## Verification

- Corrected post-#426 single-complete, partial, and multi-commit fresh-session scenarios: 3/3 passed.
- Focused `pac-commit` and fixture-ownership suites: 14/14 passed.
- `npm run check:pi-compatibility`: pinned dependency checks, typecheck, and 561/561 tests passed.
- The guarded-hook paid scenario was not rerun because its hook and push-authorization behavior is unaffected by #426.
