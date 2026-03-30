#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/tmp/backend.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Backend status: stopped"
  exit 1
fi

PID="$(cat "$PID_FILE" || true)"
if [[ -n "${PID}" ]] && kill -0 "$PID" 2>/dev/null; then
  echo "Backend status: running (PID: $PID)"
  exit 0
fi

echo "Backend status: stopped (stale pid file)"
exit 1
