#!/usr/bin/env bash
set -euo pipefail
DEST="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
TOOL="$DEST/tools/fuck-spa.js"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  on)
    cp "$HERE/dist/fuck-spa.opencode.js" "$TOOL"
    echo "fuck-spa ATIVADO — reinicie o opencode para carregar a tool"
    ;;
  off)
    rm -f "$TOOL"
    echo "fuck-spa DESATIVADO — reinicie o opencode para remover do contexto"
    ;;
  status)
    if [ -f "$TOOL" ]; then
      echo "fuck-spa ATIVO (em $TOOL)"
    else
      echo "fuck-spa DESATIVADO"
    fi
    ;;
  *)
    echo "uso: ./fuck-spa.sh on|off|status"
    exit 1
    ;;
esac