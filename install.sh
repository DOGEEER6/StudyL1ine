#!/usr/bin/env bash
# One-time server installation. Run from the project directory.
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install -r requirements.txt
chmod +x start.sh stop.sh backup.sh watchdog.sh
mkdir -p logs
echo "installed. next: cp .env.example .env && edit MATH_ACCESS_CODE / MATH_DATA_DIR, then ./start.sh"
