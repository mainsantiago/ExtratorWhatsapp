#!/usr/bin/env bash
# Gera o .zip para envio à Chrome Web Store a partir da pasta extension/.
# Uso: ./scripts/package.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/extension"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$EXT/manifest.json" | head -1)"
OUT="$ROOT/dist"
FILE="$OUT/extrator-conversas-v$VERSION.zip"

if command -v node >/dev/null 2>&1; then
  echo "Rodando testes…"
  node "$ROOT/tests/run-tests.js"
fi

mkdir -p "$OUT"
rm -f "$FILE"
( cd "$EXT" && zip -r -X -q "$FILE" . -x '.*' -x '*/.*' -x '__MACOSX/*' )
echo "Pacote gerado: $FILE"
echo "Lembrete: cada envio à loja precisa de uma versão maior no manifest.json."
