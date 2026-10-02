#!/usr/bin/env bash
# Bring the API up for the e2e harnesses.
#
# `--noreload` is deliberate: the reloader forks, and the fork is what survives
# a `pkill -f manage.py` and goes on serving the OLD code. It also means a new
# route needs a restart, which is worth remembering before concluding that a
# freshly added endpoint 404s.
#
# Restarting also CLEARS THE RATE LIMITER. The throttles use LocMemCache, which
# lives in this process, so a burst of e2e runs eventually answers 429
# `rate_limited` on `/auth/register` for a quarter of an hour — the product
# working correctly, and a confusing way to lose an afternoon.
set -euo pipefail
# The repo is the parent of this script's folder, so the same script serves the
# cloud workspace (/home/claude/repo) and a checkout on the owner's Mac. Logs go
# to $UB_E2E_LOGS (default /tmp/claude-0); `setsid` is Linux-only, so it is used
# when present and plain `nohup` detaches otherwise.
REPO=$(cd "$(dirname "$0")/.." && pwd)
LOGS=${UB_E2E_LOGS:-/tmp/claude-0}
mkdir -p "$LOGS"
DETACH=$(command -v setsid || true)
# A checkout with its own virtualenv at .venv (the Mac) uses it; the cloud
# workspace installs into the system Python.
PY=python; [ -x "$REPO/.venv/bin/python" ] && PY="$REPO/.venv/bin/python"
pkill -f "manage.py runserver" 2>/dev/null || true
sleep 2
cd $REPO/backend
$DETACH nohup "$PY" manage.py runserver 0.0.0.0:8000 --noreload > $LOGS/be-run.log 2>&1 < /dev/null &
for _ in $(seq 1 20); do
  sleep 1
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/system/health)" = "200" ]; then
    echo "api    200"; exit 0
  fi
done
echo "api    did not come up"; tail -20 $LOGS/be-run.log; exit 1
