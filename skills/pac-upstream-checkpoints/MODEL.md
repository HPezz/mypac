# Upstream checkpoint registry model

Load this reference for a full/all-sources run or when a targeted registry subset is insufficient to validate the requested operation.

## Core concepts

- **Local artifact**: one individually maintainable repository artifact: a skill, extension, prompt, theme, document, or standalone script.
- **Upstream ref**: a repository/path/ref that records provenance or supports targeted review. Its ID is globally unique.
- **Watch source**: a whole-upstream inventory scan for new, moved, removed, renamed, or uncovered assets. It does not imply adoption.
- **Checkpoint issue**: the durable review narrative and decision log.
- **Registry checkpoint**: pointer-only `last_reviewed` data used as the next accepted baseline.

The registry is local-first. Broad artifact groups and normalized top-level source definitions are outside the model.

## Registry schema

Required top-level fields:

- `schema_version`
- `checkpoint_label`
- `local_artifacts`
- `watch_sources`

Each `local_artifacts` entry requires:

- `id`: stable machine-friendly local artifact ID.
- `title`: human-readable review unit.
- `kind`: `skill`, `extension`, `prompt`, `theme`, `document`, or `script`.
- `local.paths`: files or directories belonging to this artifact.
- `upstream_refs`: one or more upstream references.
- `attribution`: source credit, license notes, and provenance notes.
- Optional `known_divergence` and `do_not_chase`.

Each `upstream_refs` entry requires:

- `id`: globally unique upstream-ref ID.
- `role`, `status`, and `sync_policy`.
- `repo`, `ref`, and `paths`.
- `attribution`.
- `last_reviewed.upstream_commit`, `checkpoint_issue`, `reviewed_at`, and `notes`.
- Optional `known_divergence` and `do_not_chase`.

Each `watch_sources` entry requires:

- `id`, `title`, and `sync_policy`.
- `repo`, `ref`, and `paths`.
- `purpose`.
- `last_reviewed.upstream_commit`, `checkpoint_issue`, `reviewed_at`, and `notes`.

## Sync policies

- `provenance_only`: record origin or attribution; do not compare parity unless requested.
- `targeted`: inspect concrete useful improvements, fixes, conventions, or rationale; do not chase parity.
- `inventory_watch`: scan watched paths for added, moved, removed, renamed, and uncovered assets.

Every upstream ref and watch source declares one policy.

## Divergence fields

- `known_divergence`: factual local/upstream differences that affect interpretation.
- `do_not_chase`: settled rules future reviews must not repeatedly propose.

They may appear on a local artifact or an upstream ref.

## Checkpoint data

`last_reviewed` is pointer-only:

- `upstream_commit`: accepted upstream commit baseline, or `null`.
- `checkpoint_issue`: accepted checkpoint URL/number, or `null`.
- `reviewed_at`: accepted ISO timestamp, or `null`.
- `notes`: short baseline notes.

Do not store review decisions in `last_reviewed`; they belong in checkpoint issues or ADR comments. Advance these pointers only after human confirmation.
