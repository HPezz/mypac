#!/usr/bin/env bash
#MISE description="Build and validate upload-ready ChatGPT Agent Skills packages"
#MISE depends=["deps"]
set -euo pipefail

npm run export:chatgpt-skills
npm run validate:chatgpt-skills:reference
