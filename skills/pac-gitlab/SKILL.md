---
name: pac-gitlab
description: "Read and mutate GitLab issues, merge requests, discussions, labels, and pipelines safely with glab. Use when a resolved target is hosted on GitLab.com or an authenticated self-hosted GitLab instance."
license: MIT
compatibility: Git repository; glab CLI required.
metadata:
  author: mypac
  stage: shared
---

# GitLab provider

Use `glab` after the workflow has resolved GitLab as the forge. Say **issue** and **merge request (MR)** in user-facing output; do not call a GitLab merge request a pull request.

## Resolution contract

Resolve the destination in this order:

1. explicit issue, merge-request, or repository URL
2. current branch tracking remote
3. `origin`

If the remaining host can belong to more than one configured provider, ask for an explicit URL. Never guess or silently fall back to GitHub. A GitLab URL has the form:

```text
https://<host>/<group>/<optional-subgroups>/<project>/-/issues/<iid>
https://<host>/<group>/<optional-subgroups>/<project>/-/merge_requests/<iid>
```

Preserve the full nested namespace and host. Confirm self-hosted authentication with:

```sh
glab auth status --hostname <host>
```

## Structured reads

Prefer one complete structured read over repeated partial reads. Full URLs make the host and nested project unambiguous:

```sh
glab issue view <full-issue-url> --output json
glab issue view <full-issue-url> --output json --comments --per-page 100
glab mr view <iid-or-branch> --repo <full-project-url> --output json
glab mr view <iid-or-branch> --repo <full-project-url> --output json --comments --per-page 100
glab mr view <iid-or-branch> --repo <full-project-url> --output json --unresolved --per-page 100
```

For fields not exposed by a high-level command, use the selected host explicitly and URL-encode the complete project path:

```sh
glab api --hostname <host> projects/<url-encoded-project-path>/issues/<iid>
glab api --hostname <host> projects/<url-encoded-project-path>/merge_requests/<iid>/discussions --paginate
```

Do not re-fetch fields already returned by a successful structured read. Make a follow-up request only for a materially missing or stale fact, or to verify a completed state transition.

## Writes

Keep the calling workflow's confirmation rules. Before editing an issue, comment, label, or relationship, read the latest remote state. Use `--repo <full-project-url>` or `--hostname <host>` on every write whose repository context is not guaranteed by the current checkout.

Surface `glab` and GitLab API failures exactly enough to identify the failed operation. Never retry a failed GitLab operation through `gh`.
