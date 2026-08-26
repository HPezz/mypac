#!/usr/bin/env bash
#MISE description="Launch Pi"
set -euo pipefail

if (($# == 0)); then
  exec pi
fi

exec pi "$@"
