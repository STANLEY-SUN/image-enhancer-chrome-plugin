#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/tmp/backend.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Backend is not running (no pid file)."
  exit 0
fi

PID="$(cat "$PID_FILE" || true)"
if [[ -z "${PID}" ]]; then
  rm -f "$PID_FILE"
  echo "Backend pid file was empty and has been removed."
  exit 0
fi

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  rm -f "$PID_FILE"
  echo "Backend stopped (PID: $PID)"
else
  rm -f "$PID_FILE"
  echo "Backend process not found, cleaned stale pid file."
fi
