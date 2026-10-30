#!/usr/bin/env bash
# math-notes · start the local Waitress server
set -euo pipefail

cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Application data (database, uploads, backups) must live on the 23T disk.
# Refuse to start if MATH_DATA_DIR points back to the system disk, so a
# forgotten mount cannot silently fill / with exam images.
DATA_DIR="${MATH_DATA_DIR:-$PWD/data}"
mkdir -p "$DATA_DIR" logs
if [ -n "${MATH_DATA_DIR:-}" ]; then
  root_fs="$(df -P / | awk 'NR==2 {print $1}')"
  data_fs="$(df -P "$DATA_DIR" | awk 'NR==2 {print $1}')"
  if [ "$root_fs" = "$data_fs" ]; then
    echo "refusing to start: MATH_DATA_DIR=$DATA_DIR is on the system disk ($data_fs)" >&2
    echo "mount the 23T data disk or fix MATH_DATA_DIR in .env" >&2
    exit 1
  fi
fi

if [ ! -x .venv/bin/python ] || [ ! -f serve.py ]; then
  echo "missing .venv or serve.py; run install.sh first" >&2
  exit 1
fi

if [ -f logs/app.pid ]; then
  old_pid="$(cat logs/app.pid 2>/dev/null || true)"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "math-notes already running (pid $old_pid)"
    exit 0
  fi
  rm -f logs/app.pid
fi

nohup .venv/bin/python serve.py >> logs/app.log 2>&1 &
echo $! > logs/app.pid

ready=0
for _ in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done

if [ "$ready" = "1" ]; then
  echo "math-notes started (pid $(cat logs/app.pid))"
else
  echo "math-notes failed to start; check logs/app.log" >&2
  tail -n 30 logs/app.log >&2 || true
  exit 1
fi
