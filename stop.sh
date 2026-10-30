#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -f logs/app.pid ]; then
  pid="$(cat logs/app.pid)"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "stopped pid $pid"
  fi
  rm -f logs/app.pid
fi
pkill -f "[.]venv/bin/python serve.py" 2>/dev/null || true
