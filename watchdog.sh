#!/usr/bin/env bash
# Keep both the local app and the Cloudflare tunnel alive.
# Runs from cron every 5 minutes; quiet unless it repairs something.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p logs

stamp() { date '+%Y-%m-%d %H:%M:%S'; }

if ! curl -fsS --max-time 4 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  echo "$(stamp) app health check failed; restarting" >> logs/watchdog.log
  ./stop.sh >> logs/watchdog.log 2>&1 || true
  sleep 1
  ./start.sh >> logs/watchdog.log 2>&1 || true
fi

if ! pgrep -x cloudflared >/dev/null 2>&1; then
  echo "$(stamp) cloudflared not running; restarting" >> logs/watchdog.log
  nohup /usr/local/bin/cloudflared tunnel --config /home/dogeeer/.cloudflared/config.yml \
    run dogeeer-wish >> /home/dogeeer/.cloudflared/tunnel.log 2>&1 &
fi
