#!/usr/bin/env bash
set -euo pipefail

if ! command -v mise >/dev/null 2>&1; then
	echo "Error: mise is required. Install it from https://mise.jdx.dev/getting-started.html" >&2
	exit 1
fi

cd "$(dirname "$0")/.."
export MISE_TASK_RUN_AUTO_INSTALL=false
exec mise run bootstrap
