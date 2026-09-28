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
pkill -f "manage.py runserver" 2>/dev/null || true
sleep 2
cd /home/claude/repo/backend
setsid nohup python manage.py runserver 0.0.0.0:8000 --noreload > /tmp/claude-0/be-run.log 2>&1 < /dev/null &
for _ in $(seq 1 20); do
  sleep 1
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/system/health)" = "200" ]; then
    echo "api    200"; exit 0
  fi
done
echo "api    did not come up"; tail -20 /tmp/claude-0/be-run.log; exit 1
