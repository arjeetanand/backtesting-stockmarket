#!/usr/bin/env bash
set -euo pipefail

frontend_port="${1:-3000}"
backend_port="${2:-${BACKEND_PORT:-8000}}"

for port_name in frontend_port backend_port; do
  port="${!port_name}"
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    echo "$port_name must be an integer between 1 and 65535 (received: $port)" >&2
    exit 2
  fi
done

api_base_url="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:${backend_port}/api/v1}"
next_dist_dir=".next-port-${frontend_port}"
exec env NEXT_PUBLIC_API_BASE_URL="$api_base_url" NEXT_DIST_DIR="$next_dist_dir" npm --prefix frontend run dev -- --hostname 127.0.0.1 --port "$frontend_port"
