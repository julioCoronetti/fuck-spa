#!/usr/bin/env bash
set -euo pipefail

FUCK_SPA_VERSION="${FUCK_SPA_VERSION:-main}"
DEST="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
RAW_BASE="https://raw.githubusercontent.com/julioCoronetti/fuck-spa/${FUCK_SPA_VERSION}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || HERE=""

if [ -n "$HERE" ] && [ -f "$HERE/dist/fuck-spa.opencode.js" ]; then
  SRC="$HERE"
else
  SRC="$(mktemp -d)"
  mkdir -p "$SRC/dist"
  curl -fsSL "$RAW_BASE/dist/fuck-spa.opencode.js" -o "$SRC/dist/fuck-spa.opencode.js"
  curl -fsSL "$RAW_BASE/dist/fuck-spa-mcp.js" -o "$SRC/dist/fuck-spa-mcp.js"
  curl -fsSL "$RAW_BASE/skill.md" -o "$SRC/skill.md"
  curl -fsSL "$RAW_BASE/package.json" -o "$SRC/package.json"
fi

mkdir -p "$DEST/tools" "$DEST/mcp" "$DEST/skills/fuck-spa"
rm -f "$DEST/tools/fuck-spa.ts"
rm -rf "$DEST/tools/core"
cp "$SRC/dist/fuck-spa.opencode.js" "$DEST/tools/fuck-spa.js"
cp "$SRC/dist/fuck-spa-mcp.js" "$DEST/mcp/fuck-spa-mcp.js"
cp "$SRC/skill.md" "$DEST/skills/fuck-spa/SKILL.md"
cp "$SRC/package.json" "$DEST/tools/fuck-spa.json" 2>/dev/null || true
echo "fuck-spa ${FUCK_SPA_VERSION} instalado em $DEST"
echo "Para aprovar cada uso (sem uso indiscriminado), adicione no opencode.json:"
echo '  "permission": { "tools": { "fuck-spa": "ask" } }'

if command -v bun >/dev/null 2>&1; then
  PKG=bunx
elif command -v npx >/dev/null 2>&1; then
  PKG=npx
else
  echo "ERRO: instale Node.js (npm) ou bun antes de rodar o install.sh"
  exit 1
fi

NODE_BIN="$(dirname "$(command -v node 2>/dev/null || command -v npx 2>/dev/null || echo /usr/bin)")"
SUDO_CMD="sudo env \"PATH=\$PATH:$NODE_BIN\" \"$NODE_BIN/npx\""

if command -v bun >/dev/null 2>&1; then
  (cd "$DEST" && bun add playwright 2>/dev/null || bun install) >/dev/null 2>&1 || true
else
  (cd "$DEST" && npm install playwright) >/dev/null 2>&1 || true
fi

echo "Baixando chromium..."
(cd "$DEST" && $PKG playwright install chromium) >/dev/null 2>&1 || echo "AVISO: nao baixou o chromium, rode '$PKG playwright install chromium'"

echo "Instalando libs de sistema do chromium (pode pedir senha do sudo)..."
if ! (cd "$DEST" && $PKG playwright install-deps chromium) >/dev/null 2>&1; then
  echo "AVISO: instale as libs manualmente com:"
  echo "  $SUDO_CMD playwright install-deps chromium"
fi

echo "Verificando se o chromium abre..."
if (cd "$DEST" && node -e "const{chromium}=require('playwright');chromium.launch({headless:true}).then(b=>b.close()).catch(()=>process.exit(1))" 2>/dev/null); then
  echo "fuck-spa instalado e funcionando em $DEST"
else
  echo "AVISO: chromium nao abre. Instale as libs de sistema com:"
  echo "  $SUDO_CMD playwright install-deps chromium"
fi
