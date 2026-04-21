#!/usr/bin/env bash
#MISE description="Launch pi (shared mypac resources should be configured in ~/.pi/agent/settings.json)"
set -euo pipefail

if (($# == 0)); then
  exec pi
fi

exec pi "$@"
