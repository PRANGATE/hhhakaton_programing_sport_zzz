#!/usr/bin/env bash
# scripts/start-tunnel.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS="$DIR/.deploy-secrets.json"

VPS_HOST="${VPS_HOST:-31.185.105.155}"
VPS_PORT="${VPS_PORT:-4010}"
LLM_MODEL="${LLM_MODEL:-llama3.1:8b}"

if [[ ! -f "$SECRETS" ]]; then
  echo "Не найден $SECRETS. Сначала запусти .\\deploy.ps1 или -RotateSecrets." >&2
  exit 1
fi

TUNNEL_SECRET="$(python3 - <<PY
import json,sys
with open("$SECRETS") as f: d=json.load(f)
sys.stdout.write(d.get("TUNNEL_SECRET",""))
PY
)"

if [[ -z "$TUNNEL_SECRET" ]]; then
  echo "В $SECRETS нет TUNNEL_SECRET." >&2
  exit 1
fi

command -v node   >/dev/null || { echo "node не найден"; exit 1; }
command -v ollama >/dev/null || { echo "ollama не найдена"; exit 1; }

export VPS_TUNNEL_URL="ws://${VPS_HOST}:${VPS_PORT}/ollama-tunnel"
export TUNNEL_SECRET
export LLM_MODEL

echo "==> VPS_TUNNEL_URL = $VPS_TUNNEL_URL"
echo "==> LLM_MODEL      = $LLM_MODEL"
echo "==> Запускаю tunnel/client.js…"

exec node "$DIR/tunnel/client.js"