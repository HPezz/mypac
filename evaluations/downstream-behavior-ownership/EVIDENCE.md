# Downstream behavior-ownership validation

This ledger separates durable static proof from disposable fresh-session evidence. Generated repositories, manifests, transcripts, and reports stay outside this repository.

The accepted [#411 activation-timing ADR](https://github.com/ladislas/mypac/issues/411#issuecomment-5467272003) supersedes exact `pac-commit` read-order gating. Read order is an efficiency observation, not a pass/fail criterion. The safety gate applies before `git commit`: a coherent slice must exist, proportionate verification must be complete or the strongest available evidence gathered, and repository/user permission must allow commit creation.

## Evidence matrix

| Claim | Proof type | Evidence |
|---|---|---|
| `main` default branch with no local Git policy uses the mypac fallback | Static and fresh-session | The fixture has no `AGENTS.md`; its verifier requires a non-default branch and the mypac message pattern. The post-#420 natural-language run passed with `🔧 chore: Complete fixture task`, kept only `main` on the disposable remote, and stayed non-closing. |
| `develop` default branch with explicit local branch/message policy uses local policy | Static and fresh-session | Fixture policy requires `downstream/validate-policy` and `DOWNSTREAM:` subjects. A valid original run passed the full verifier, pushed only the feature branch, and left `develop` at the baseline. The post-#420 trace again used `DOWNSTREAM: complete task refs #9001`; its disposable baseline-ref anomaly is not used as policy proof. |
| Stronger local restriction and mutating hook survive | Static and fresh-session | Guarded policy forbids agent pushes even when the prompt grants authorization. The committed hook stages `hook-state.txt=checked`. The fresh run passed the verifier, kept only `main` on the remote, committed the hook mutation, and rechecked status afterward. |
| Natural-language and `/pac-lwot` entry paths are covered | Static and fresh-session | The generated matrix contains two natural-language runs and one `/pac-lwot` run, with exactly one profile/scenario each and no Cartesian expansion. All three produced the requested committed slice. |
| Partial issue-backed work does not close automatically | Static and fresh-session | Fixture verifiers reject closing keywords for #9001. Observed subjects were non-closing, including `DOWNSTREAM: complete task refs #9001` and `GUARDED: complete task state refs #9001`. |
| Commit, push, and merge authorization remain independent | Static and fresh-session | Main fallback committed without pushing; develop pushed only after explicit authorization and did not merge; guarded did not push because stronger local policy overrode prompt-level authorization. No session performed a merge. |
| Complete/current `AGENTS.md` is not redundantly re-read | Fresh-session plus reused #366 baseline | Explicit `AGENTS.md` read count was zero in all three post-#420 sessions. #366 already proves `AGENTS.md` is automatically loaded repository context. |
| Actual commit creation is gated on slice, evidence, and permission | Static and fresh-session | `pac-commit` and `/pac-lwot` statically require the three-part pre-commit gate. Existing traces show implementation and evidence before `git commit`, with permission supplied by prompt/repository policy; detailed sequences follow. |
| `pac-commit` read timing remains progressive | Static and observational | Product contracts call exact read order an efficiency goal rather than a safety guarantee. The traces retain read positions for context analysis without treating an earlier read as failure. |

## Fresh-session proof

The three activation-sensitive cases were rerun after #420 with `openai-codex/gpt-5.6-luna`, medium thinking, and Pi 0.84.3. #421 changed the contract interpretation rather than product policy or fixture behavior, so these paid sessions are reused instead of rerun. Raw generated evidence remains under `/tmp/mypac-downstream-behavior/results/` and is not committed.

High-level read/tool sequence:

| Run | Commit-gate evidence | Relevant sequence |
|---|---|---|
| `main-fallback` (natural language) | Prompt allowed a verified commit; the exact task edit formed the coherent slice; `git diff` plus an exact content assertion checked it before commit | edit (12) → read `pac-commit` (13, informational) → diff/content/status check, scoped stage, and `git commit` in order (14) → verifier/status (15–16) |
| `develop-local` (`/pac-lwot`) | Repository policy allowed commits and required `node --test`; the completed edit passed that check plus focused diff/state checks before commit | edit (8) → `node --test`, verifier attempt, and diff check (9–11) → read `pac-commit` (12, informational) → scoped stage and `git commit` (13) → authorized push without merge (14) |
| `guarded-hook` (natural language) | Repository policy allowed commits but prohibited pushes; the completed edit passed `node --test` before commit | edit (14) → `node --test` (15) → read `pac-commit` (16, informational) → diff, scoped stage, `git commit`, and hook mutation (17) → verifier and post-hook status recheck (18–20) |

The sequences prove the amended safety boundary before `git commit` while preserving progressive-context observations. No new product-behavior gap appears under the accepted ADR.

## Static proof

- `shared/shared-guidance.test.mjs` locks universal default-branch and per-operation authorization floors while excluding repository-specific message and merge policy.
- `skills/pac-commit/skill.test.mjs` locks local message-policy precedence, mypac fallback, stronger restrictions, non-closing issue association, post-hook state rechecks, and the three-part pre-commit gate.
- `scripts/workflow-routing.test.mjs` locks `/pac-lwot` policy reuse, complete/current `AGENTS.md` non-rereads, progressive read-order semantics, pre-commit verification/evidence and permission, and independent push/merge authorization.
- `evaluation.test.mjs` locks the disposable fixture shapes, the three-run natural-language/`/pac-lwot` matrix, ownership contracts, and this evidence classification.

## Reused #366 evidence

The closing evidence on #366 audited model-visible context in isolated fresh processes and found `AGENTS.md` was the only automatically loaded repository document. It also established that paid E2E should not be repeated when current static coverage or durable fresh-session evidence already proves a claim. #415 reuses that automatic-loading baseline and the unaffected policy outcomes from valid prior fixture runs.

## Verification

- Focused fixture/ownership suite: 28/28 passed.
- `npm run check:pi-compatibility`: pinned dependency checks, typecheck, and 548/548 tests passed.
- No paid E2E was rerun after #421 because the accepted ADR changed the assertion boundary, not the already-observed fixture behavior.
