# Local Pi evaluations

`pac-eval` runs every scenario/profile pair in a fresh Pi session and disposable Git clone. Generated data defaults to `~/.pi/agent/evals/<id>/` and must remain outside both the target repository and the invoking checkout.

## Manifest

Manifests are JSON validated against the shape in [`schemas/pac-eval-manifest.schema.json`](../schemas/pac-eval-manifest.schema.json):

```json
{
  "$schema": "../schemas/pac-eval-manifest.schema.json",
  "version": 1,
  "id": "example",
  "repository": { "path": "/path/to/target-repository", "ref": "main" },
  "profiles": [
    {
      "id": "control",
      "model": "provider/exact-model-id",
      "thinking": "medium"
    },
    {
      "id": "candidate",
      "model": "provider/exact-model-id",
      "thinking": "high",
      "workflow": "/pac-lwot",
      "package": {
        "path": "/path/to/mypac",
        "ref": "candidate-ref",
        "prompts": true,
        "skills": true
      }
    }
  ],
  "scenarios": [
    {
      "id": "narrow-change",
      "prompt": "Implement the requested narrow change.",
      "timeoutMs": 600000,
      "verify": [
        { "command": "npm", "args": ["test"], "timeoutMs": 120000 }
      ],
      "artifacts": ["test-results.json"]
    }
  ]
}
```

`repository.ref` is resolved once before matrix execution, so every profile starts at the same target SHA. A profile's optional package is cloned independently at its own immutable resolved ref; only its prompts and/or skills can be loaded. Profiles cannot enable extensions or shell tools.

## Commands

Preview the exact matrix without a model call:

```sh
npm run eval -- evaluation.json --dry-run
```

Execute it:

```sh
npm run eval -- evaluation.json
```

The execution plan is printed before launch. Each run retains `result.json`, Pi JSON stdout, stderr, the fresh session, external-verification logs, git status/diff/commits, timing, and requested artifacts under the evaluation directory. The disposable repository and package clones are removed after capture.

## Safety boundary

The Pi child receives only `read`, `edit`, `write`, `grep`, `find`, and `ls`; extension discovery is disabled, Git remotes are removed, common publication credentials are stripped, and Pi runs in the disposable clone. Verification commands are trusted manifest input and run directly without a shell. The runner never pushes, publishes, merges, or calls GitHub.

A run is normalized as `passed`, `child_failed`, `timed_out`, `configuration_mismatch`, `verification_failed`, or `runner_error`. Actual provider/model and clamped thinking are read from Pi's retained session entries and compared with the requested profile.
