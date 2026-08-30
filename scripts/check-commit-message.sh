#!/usr/bin/env sh
set -eu

message_file=$1

if grep -F '\n' "$message_file" >/dev/null; then
	cat >&2 <<'EOF'
Refusing commit message containing literal \n text.

Use multiple git commit -m arguments or a message file for genuine newlines.
EOF
	exit 1
fi
