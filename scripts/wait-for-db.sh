#!/usr/bin/env bash
# scripts/wait-for-db.sh — block until PostgreSQL accepts connections, or give up.
#
# Used by scripts/bootstrap.sh and by CI, where the database is a service
# container rather than a compose service. The container entrypoint has its own
# copy of this logic (backend/entrypoint.sh) because it must run with only the
# image's Python available; this script is the host-side equivalent and uses
# pg_isready when it is present.
#
# Usage: wait-for-db.sh [--timeout SECONDS] [--host HOST] [--port PORT]
#                       [--user USER] [--dbname NAME] [--compose]
#
# --compose waits on `docker compose ps db` reporting healthy instead, which is
# what the bootstrap sequence wants because the healthcheck is the contract.
set -euo pipefail

TIMEOUT=120
HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
USER="${POSTGRES_USER:-udhaarbook}"
DBNAME="${POSTGRES_DB:-udhaarbook}"
MODE=direct

while [ $# -gt 0 ]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --host)    HOST="$2";    shift 2 ;;
    --port)    PORT="$2";    shift 2 ;;
    --user)    USER="$2";    shift 2 ;;
    --dbname)  DBNAME="$2";  shift 2 ;;
    --compose) MODE=compose;  shift   ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "wait-for-db: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

deadline=$(( $(date +%s) + TIMEOUT ))

log() { printf '{"event":"wait_for_db.%s","mode":"%s","target":"%s:%s"}\n' "$1" "$MODE" "$HOST" "$PORT"; }

log start

while [ "$(date +%s)" -lt "$deadline" ]; do
  case "$MODE" in
    compose)
      state="$(docker compose ps --format '{{.Health}}' db 2>/dev/null | head -1 || true)"
      if [ "$state" = "healthy" ]; then log ready; exit 0; fi
      ;;
    direct)
      if command -v pg_isready >/dev/null 2>&1; then
        if pg_isready -h "$HOST" -p "$PORT" -U "$USER" -d "$DBNAME" >/dev/null 2>&1; then
          log ready; exit 0
        fi
      elif command -v python3 >/dev/null 2>&1 && \
           python3 - "$HOST" "$PORT" <<'PY' >/dev/null 2>&1; then
import socket, sys
s = socket.create_connection((sys.argv[1], int(sys.argv[2])), timeout=3)
s.close()
PY
        log ready; exit 0
      fi
      ;;
  esac
  sleep 2
done

printf '{"event":"wait_for_db.unavailable","level":"CRITICAL","waited_seconds":%s}\n' "$TIMEOUT" >&2
exit 1
