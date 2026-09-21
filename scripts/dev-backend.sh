#!/usr/bin/env bash
# scripts/dev-backend.sh — the native (no Docker) backend, from nothing to serving.
#
# Everything here is idempotent, so running it twice is safe and running it on a
# machine that is already set up just starts the server. It exists because the
# native path had four steps a person had to remember in order — create the
# database, export three variables, migrate, seed — and forgetting any one of
# them fails with an error that names the symptom rather than the step.
#
# Usage:
#   scripts/dev-backend.sh              # set up if needed, then run on :8000
#   scripts/dev-backend.sh --port 8080
#   scripts/dev-backend.sh --reset      # drop and rebuild the database first
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

DB="${POSTGRES_DB:-digikhaato_dev}"
PORT=8000
RESET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port)  PORT="$2"; shift 2 ;;
    --reset) RESET=1;   shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "dev-backend: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

step() { echo; echo "── $* ──────────────────────────────"; }
die()  { echo "dev-backend: $*" >&2; exit 1; }

command -v psql >/dev/null || die "psql not found. Is PostgreSQL installed and on PATH?"
pg_isready -q || die "PostgreSQL is not accepting connections. Start it first (brew services start postgresql@16)."

# `pg_isready` only says the server answered — it does not say THIS user may log
# in. Without this check the next command fails with `FATAL: role "<you>" does
# not exist`, which reads like a broken install and is only a username mismatch:
# Postgres defaults the role to your shell user, and a server set up under a
# different name (or by Docker, or by a colleague) will not have it.
if ! psql -d postgres -qtAc 'SELECT 1' >/dev/null 2>&1; then
  die "connected to PostgreSQL but could not log in as '${PGUSER:-$(whoami)}'.
     Set PGUSER to a role that exists, e.g.
       PGUSER=postgres scripts/dev-backend.sh
     or create your own role once:
       createuser -s $(whoami)"
fi

# Local dev only. A real secret belongs in .env and never in a script.
export UB_SECRET_KEY="${UB_SECRET_KEY:-local-dev-only-not-a-secret-$(whoami)}"
export UB_DEBUG="${UB_DEBUG:-1}"
export POSTGRES_DB="$DB"
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.local}"

if [ "$RESET" = "1" ]; then
  step "Dropping $DB"
  dropdb --if-exists "$DB"
fi

if psql -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
  echo "database $DB already exists"
else
  step "Creating $DB"
  createdb "$DB"
fi

step "Migrations"
python3 manage.py migrate --noinput

step "Seeding reference data (idempotent)"
python3 manage.py seed_all

step "Serving on http://localhost:$PORT"
echo "  health  http://localhost:$PORT/api/v1/system/health"
echo "  sign up http://localhost:3000/signup  (start the frontend in another terminal)"
echo
exec python3 manage.py runserver "0.0.0.0:$PORT"
