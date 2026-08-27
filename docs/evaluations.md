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
      "execution": {
        "tools": ["read", "bash", "edit", "write", "grep", "find", "ls"]
      },
      "package": {
        "path": "/path/to/mypac",
        "ref": "candidate-ref",
        "resources": {
          "prompts": ["prompts"],
          "skills": ["skills"],
          "extensions": ["extensions/shared-append-system/index.ts"]
        }
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

`repository.ref` and every profile package ref are resolved to commit SHAs before any child starts, so every profile receives stable target and package inputs. A profile's optional package is cloned independently at its resolved SHA. Package resources are package-relative allowlists: only the named prompt, skill, and extension files or directories are loaded.

Without `execution`, Pi receives the restricted `read`, `edit`, `write`, `grep`, `find`, and `ls` tools. Trusted implementation evaluations can opt into an explicit built-in-tool allowlist, including `bash`, as shown above. Selected extensions remain subject to the same tool allowlist; extension discovery stays disabled.

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

The safe default gives the Pi child only `read`, `edit`, `write`, `grep`, `find`, and `ls`, with extension discovery disabled. Elevated tools and selected package resources are explicit trusted-evaluation policy, not defaults.

Every child receives a disposable HOME and Pi config directory. The runner copies only Pi authentication/model-catalog files needed for model access, then deletes that config after the run; maintainer GitHub/npm/SSH config and credentials are not inherited. Git remotes are removed, common publication credentials are stripped, and a local disposable Git identity is configured for implementation commits. Verification commands are trusted manifest input and run directly without a shell. The runner itself never pushes, publishes, merges, or calls GitHub.

A run is normalized as `passed`, `child_failed`, `timed_out`, `configuration_mismatch`, `verification_failed`, or `runner_error`. Actual provider/model and clamped thinking are read from Pi's retained session entries and compared with the requested profile.
