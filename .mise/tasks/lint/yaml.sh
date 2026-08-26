#!/usr/bin/env bash
#MISE description="Lint YAML files"
set -euo pipefail

existing_files=()
while IFS= read -r file; do
  if [[ -f "$file" ]]; then
    existing_files+=("$file")
  fi
done < <(git ls-files '*.yml' '*.yaml')

if ((${#existing_files[@]} == 0)); then
  exit 0
fi

yamllint -c .yamllint.yaml "${existing_files[@]}"
