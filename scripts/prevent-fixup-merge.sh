#!/usr/bin/env sh
set -eu

zero_oid="0000000000000000000000000000000000000000"

offending_commits_for_range() {
	range=$1
	log_output=$(git log --format='%H %s' "$range" -- 2>&1) || {
		printf 'Unable to inspect commits for range %s:\n%s\n' "$range" "$log_output" >&2
		exit 1
	}

	printf '%s\n' "$log_output" | grep '^[0-9a-f][0-9a-f]* fixup!' || true
}

check_pre_push() {
	offending_commits=""
	while read -r local_ref local_oid remote_ref remote_oid; do
		[ -n "${local_ref:-}" ] || continue
		[ "$remote_ref" = "refs/heads/main" ] || continue
		[ "$local_oid" != "$zero_oid" ] || continue

		if [ "$remote_oid" = "$zero_oid" ]; then
			range="$local_oid"
		else
			range="$remote_oid..$local_oid"
		fi

		commits=$(offending_commits_for_range "$range")
		if [ -n "$commits" ]; then
			offending_commits=${offending_commits}${commits}'
'
		fi
	done

	if [ -z "$offending_commits" ]; then
		exit 0
	fi

	cat >&2 <<EOF
Refusing to push fixup! commits to main.

Squash these commits before pushing, for example with:
  git rebase --autosquash main

Offending commits:
$offending_commits
EOF

	exit 1
}

check_pre_merge_commit() {
	current_branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
	if [ "$current_branch" != "main" ]; then
		exit 0
	fi

	if [ ! -f "$(git rev-parse --git-path MERGE_HEAD)" ]; then
		exit 0
	fi

	offending_commits=""
	while IFS= read -r merge_head; do
		[ -n "$merge_head" ] || continue
		commits=$(offending_commits_for_range HEAD.."$merge_head")
		if [ -n "$commits" ]; then
			offending_commits=${offending_commits}${commits}'
'
		fi
	done < "$(git rev-parse --git-path MERGE_HEAD)"

	if [ -z "$offending_commits" ]; then
		exit 0
	fi

	cat >&2 <<EOF
Refusing to merge fixup! commits into main.

Squash these commits before merging, for example with:
  git rebase --autosquash main

Offending commits:
$offending_commits
EOF

	exit 1
}

case "${1:-pre-merge-commit}" in
	pre-push)
		check_pre_push
		;;
	pre-merge-commit)
		check_pre_merge_commit
		;;
	*)
		echo "Usage: $0 [pre-merge-commit|pre-push]" >&2
		exit 2
		;;
esac
