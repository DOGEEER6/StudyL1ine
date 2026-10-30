#!/usr/bin/env bash
# Daily backup: database + uploaded images, kept in DATA_DIR/backups (last 20).
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
DATA_DIR="${MATH_DATA_DIR:-$PWD/data}"
if [ -n "${MATH_DATA_DIR:-}" ]; then
  root_fs="$(df -P / | awk 'NR==2 {print $1}')"
  data_fs="$(df -P "$DATA_DIR" | awk 'NR==2 {print $1}')"
  if [ "$root_fs" = "$data_fs" ]; then
    echo "refusing backup: DATA_DIR=$DATA_DIR is on the system disk" >&2
    exit 1
  fi
fi
mkdir -p logs
if [ -x .venv/bin/python ]; then
  .venv/bin/python app.py backup >> logs/backup.log 2>&1
else
  python3 app.py backup >> logs/backup.log 2>&1
fi
