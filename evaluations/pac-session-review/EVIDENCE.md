# pac-session-review fresh-session evidence

## Run

- Workflow: `/pac-session-review /Users/ladislas/dev/ladislas/mypac`
- Model: `openai-codex/gpt-5.6-luna`, medium thinking
- Session: fresh isolated Pi session directory
- Selected source: real local mypac session `01a051a8…7730` (105 message records; no raw transcript content retained here)
- Tools available: `read`, `bash`

## Model-visible sequence

| Step | Evidence | Assistant output | Context/usage |
| --- | --- | ---: | ---: |
| Metadata discovery | Ten matching sessions found through `discoverPiSessions`; only IDs, timestamps/message counts, paths, repository metadata, and malformed-line counts were exposed. The model asked for selection. | 387 chars | 9,383 total tokens (2,463 input, 6,656 cache read, 264 output) |
| Initial selected window | `parseCompactPiSessionEvents` returned exactly events 1–24 of 130, maximum event text 240 chars, and `nextStartSequence: 25`. The model stopped and named one specific question for later evidence. | 695 chars | 36,258 total tokens (4,610 input, 31,232 cache read, 416 output) |
| Targeted later window | The same selected file path with `startSequence: 97` returned exactly events 97–120 of 130, maximum event text 240 chars, and `nextStartSequence: 121`; events 1–96 were not emitted. Current `pac-uv` guidance was checked and the result was **no change** under #411. | 396 chars | 35,986 total tokens (5,393 input, 30,208 cache read, 385 output) |

No step used the `read` tool on session JSONL. Inline Node invocations printed only discovery metadata or the compact parser return value.

## Default confirmation

The 24-event, 240-character defaults were sufficient to identify a concrete follow-up question, inspect a non-adjacent later window without replaying prior events, and reach a current-artifact-backed no-change result. This is run-specific evidence for compact defaults, not a universal token threshold.
