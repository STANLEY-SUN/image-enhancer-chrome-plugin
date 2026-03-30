#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PY="$ROOT_DIR/.venv-realesrgan/bin/python"
PID_FILE="$ROOT_DIR/tmp/backend.pid"
LOG_FILE="$ROOT_DIR/tmp/backend.log"

mkdir -p "$ROOT_DIR/tmp"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${PID}" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "Backend already running (PID: $PID)"
    echo "Health: http://127.0.0.1:8765/health"
    exit 0
  fi
fi

nohup "$VENV_PY" -m uvicorn server.realesrgan_api:app --host 127.0.0.1 --port 8765 >"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" >"$PID_FILE"

sleep 1
if kill -0 "$PID" 2>/dev/null; then
  echo "Backend started (PID: $PID)"
  echo "Health: http://127.0.0.1:8765/health"
  echo "Log: $LOG_FILE"
else
  echo "Backend failed to start. Check log: $LOG_FILE"
  exit 1
fi
