#!/usr/bin/env bash
set -euo pipefail

# Codespace creation is intentionally cheap and deterministic. Do not install
# the monorepo, provision swap, or copy/create .env files automatically.
cd "$(git rev-parse --show-toplevel)"

expected_pnpm=$(node -p 'require("./package.json").packageManager.split("@").pop()')
actual_pnpm=$(pnpm --version)
if [[ "$actual_pnpm" != "$expected_pnpm" ]]; then
  echo "MemoFlow requires pnpm $expected_pnpm; found $actual_pnpm" >&2
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)'
echo "MemoFlow Codespaces tools verified: Node $(node --version), pnpm $actual_pnpm"

case "${1:-}" in
  ""|--check)
    echo 'Install dependencies on demand: pnpm install --frozen-lockfile'
    ;;
  --install)
    pnpm install --frozen-lockfile
    ;;
  *)
    echo 'Usage: bash .devcontainer/post-create.sh [--check|--install]' >&2
    exit 2
    ;;
esac
