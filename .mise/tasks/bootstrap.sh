#!/usr/bin/env bash
#MISE description="Set up this checkout and reconcile the global Pi environment"
set -euo pipefail

if ! command -v mise >/dev/null 2>&1; then
	echo "Error: mise is required. Install it from https://mise.jdx.dev/getting-started.html" >&2
	exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
	echo "Error: Pi is required. Install it before bootstrapping mypac: https://github.com/earendil-works/pi" >&2
	exit 1
fi

cd "$(dirname "$0")/../.."

npm ci
mise install
mise run hooks
mise run sync
