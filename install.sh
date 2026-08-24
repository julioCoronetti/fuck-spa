#!/usr/bin/env bash
set -euo pipefail
DEST="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$DEST/tools" "$DEST/skills/fuck-spa"
cp "$HERE/tool/fuck-spa.ts" "$DEST/tools/"
cp "$HERE/skill.md" "$DEST/skills/fuck-spa/SKILL.md"
cp "$HERE/package.json" "$DEST/tools/fuck-spa.json" 2>/dev/null || true
if command -v bun >/dev/null 2>&1; then
  (cd "$DEST" && bun add playwright 2>/dev/null || bun install)
  (cd "$DEST" && bunx playwright install chromium 2>/dev/null || true)
elif command -v npm >/dev/null 2>&1; then
  (cd "$DEST" && npm install playwright 2>/dev/null || true)
  (cd "$DEST" && npx playwright install chromium 2>/dev/null || true)
fi
echo "fuck-spa instalado em $DEST"
