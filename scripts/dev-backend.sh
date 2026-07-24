#!/usr/bin/env bash
set -euo pipefail

port="${1:-8000}"

if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "Backend port must be an integer between 1 and 65535 (received: $port)" >&2
  exit 2
fi

uvicorn_bin="uvicorn"
if [[ -x .venv/bin/uvicorn ]]; then
  uvicorn_bin=".venv/bin/uvicorn"
fi

exec "$uvicorn_bin" quant_research.api.main:app --reload --host 127.0.0.1 --port "$port"
