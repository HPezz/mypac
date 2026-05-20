# Upstream checkpoint registry model

This model defines the vocabulary for `.pac/upstream-sources.yaml` and `/pac-upstream-checkpoints`.

## Core concepts

- **Local artifact**: one individually maintainable repo artifact, such as a single skill, extension, prompt, document, or standalone script. This is the primary registry unit.
- **Upstream ref**: one source repository/path/ref that explains a local artifact's provenance or provides a current reference for targeted review. Upstream-ref IDs are globally unique so users can target one directly.
- **Watch source**: an upstream inventory scan for discovering new, moved, removed, or renamed assets. A watch source is not a local artifact and does not imply adoption.
- **Checkpoint issue**: the durable GitHub review narrative and decision log for an upstream review run.
- **Registry checkpoint**: the pointer-only `last_reviewed` data stored in YAML so the next run knows where to resume.

## Allowed local artifact kinds

- `skill`: one local skill directory under `skills/`.
- `extension`: one local extension directory under `extensions/`.
- `prompt`: one local prompt file under `prompts/`.
- `document`: one standalone document with active upstream tracking.
- `script`: one standalone script with active upstream tracking.

Docs or scripts that are part of a skill or extension are covered by that parent artifact.

## Sync policies

Every upstream ref and watch source must declare `sync_policy`.

- `provenance_only`: Records origin or attribution. Do not regularly compare for parity unless a human asks.
- `targeted`: Check for specific useful improvements, bug fixes, conventions, or rationale. Do not chase feature parity.
- `inventory_watch`: Scan an upstream path for newly added, moved, removed, or renamed assets.

## Divergence fields

- `known_divergence`: factual differences between local and upstream that help reviewers interpret comparisons.
- `do_not_chase`: explicit rules for things future reviews should not repeatedly propose.

Both fields may appear on a local artifact or on a specific upstream ref.

## Checkpoint data

`last_reviewed` is pointer-only. It contains:

- `upstream_commit`: upstream commit hash last accepted as the checkpoint baseline, or `null`.
- `checkpoint_issue`: GitHub issue URL/number for that accepted checkpoint, or `null`.
- `reviewed_at`: ISO timestamp for that accepted checkpoint, or `null`.
- `notes`: short baseline notes.

Do not store decision summaries in `last_reviewed`; decisions live in checkpoint issues or ADR comments.

## Out of model

- Top-level artifact groups.
- Top-level normalized source definitions.
- Active tracking for documents that only provided initial inspiration and do not need ongoing comparison.
