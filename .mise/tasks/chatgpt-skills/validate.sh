#!/usr/bin/env bash
#MISE description="Validate existing ChatGPT Agent Skills packages"
#MISE depends=["deps"]
set -euo pipefail

npm run validate:chatgpt-skills:reference
