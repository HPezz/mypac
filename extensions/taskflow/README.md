# Pi TaskFlow

Pi TaskFlow keeps long-running work in GitLab issues while Pi sessions remain short-lived.
All TaskFlow commands are extension commands: deterministic navigation and writes do not start the agent or call a model.

## Commands

```text
/task <iid|full GitLab issue URL>
/task-next
/task-board
/task-status
/task-save
/task-move <todo|doing|review|done>
```

- `/task` selects an issue, displays its current status, and places concise issue context in Pi's editor for review. It does not submit the editor.
- `/task-next` lists `pac:ready_for_agent` issues across the current GitLab group and opens a TUI selector.
- `/task-board` renders open issues from every project in the group under the four `State::*` columns. It is read-only and works without GitLab group-board features.
- `/task-status` refreshes the active issue and its checkpoint pointer.
- `/task-save` opens a structured checkpoint editor, previews the remote write, and requires confirmation.
- `/task-move` previews and confirms an exclusive `State::*` label transition.

The active pointer is stored outside repositories under `~/.pi/agent/taskflow/active/`. It contains only the GitLab project, IID, URL, and selection timestamp. GitLab remains the source of truth.

## GitLab workflow

TaskFlow reuses the existing labels:

| Alias | GitLab label |
|---|---|
| `todo` | `State::To Do` |
| `doing` | `State::Doing` |
| `review` | `State::Waiting for Review` |
| `done` | `State::Done` |

Readiness and execution remain separate:

- `pac:ready_for_agent` / `pac:ready_for_human`
- `pac:afk` / `pac:hitl`

TaskFlow never creates a missing label automatically.

## Multi-repository Kanban

`/task-board` provides the group-wide delivery view without requiring GitLab Premium. It reads open issues separately for each group-scoped state label and displays their project, IID, title, and assignees.

A native GitLab group issue board can use the same labels when the namespace plan supports group-board creation. Board and label changes are remote mutations and must be previewed and explicitly authorized separately.

## Checkpoints

A checkpoint is posted as an immutable issue note containing `<!-- pi-taskflow:checkpoint:v1 -->`. TaskFlow then updates only this reserved issue-description block:

```markdown
<!-- pi-taskflow:start -->
## Pi TaskFlow

- Latest checkpoint: <note URL>
- Saved at: <timestamp>
<!-- pi-taskflow:end -->
```

A fresh session retrieves the referenced note directly instead of reading all historical comments. If the description update fails, the posted note remains the recoverable checkpoint.

## Multi-repository workspace behavior

A numeric IID is accepted inside a GitLab repository or when the workspace already has an active TaskFlow project. At an ambiguous workspace root, use a full GitLab issue URL for the first selection.
