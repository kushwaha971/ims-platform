#!/usr/bin/env bash
# scripts/docker-backend.sh — the API in Docker against the PostgreSQL on this
# machine, with the two host-side prerequisites checked before anything starts.
#
# Without those checks the failure is a container that retries for sixty seconds
# and exits "database not ready", which says nothing about which of the two
# settings is wrong.
#
# Usage:
#   scripts/docker-backend.sh            # check, build, migrate, seed, serve
#   scripts/docker-backend.sh --check    # just the preflight
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB="${POSTGRES_DB:-digikhaato_dev}"
COMPOSE=(docker compose -f docker-compose.backend.yml)
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

step() { echo; echo "── $* ──────────────────────────────"; }
die()  { echo "docker-backend: $*" >&2; exit 1; }

step "Preflight"

command -v docker >/dev/null || die "docker is not installed"
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop."
echo "  ✓ docker is running"

command -v psql >/dev/null || die "psql not found — is PostgreSQL installed?"
pg_isready -q || die "PostgreSQL is not accepting connections (brew services start postgresql@16)"
echo "  ✓ postgres is up"

if ! psql -d postgres -qtAc 'SELECT 1' >/dev/null 2>&1; then
  die "cannot log in as '${PGUSER:-$(whoami)}'. Set PGUSER, or: createuser -s $(whoami)"
fi

if psql -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
  echo "  ✓ database $DB exists"
else
  echo "  · creating $DB"
  createdb "$DB"
fi

# 1. Is it listening beyond loopback? Homebrew's default is 'localhost', which a
#    container cannot reach however correct everything else is.
listen=$(psql -d postgres -qtAc 'SHOW listen_addresses' 2>/dev/null || echo '?')
case "$listen" in
  '*'|'0.0.0.0'*) echo "  ✓ listen_addresses = $listen" ;;
  *) die "listen_addresses is '$listen' — a container cannot reach that.
     Set listen_addresses = '*' in $(psql -d postgres -qtAc 'SHOW config_file' 2>/dev/null || echo postgresql.conf)
     then: brew services restart postgresql@16" ;;
esac

# 2. Will pg_hba accept the Docker bridge? Checked by looking for a rule that is
#    not loopback-only rather than by parsing every line.
hba=$(psql -d postgres -qtAc 'SHOW hba_file' 2>/dev/null || echo '')
if [ -n "$hba" ] && [ -r "$hba" ]; then
  if grep -Eq '^\s*host\s+.*(0\.0\.0\.0/0|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.65\.)' "$hba"; then
    echo "  ✓ pg_hba.conf admits a non-loopback network"
  else
    die "pg_hba.conf has no rule for Docker's network. Add ABOVE the existing host lines in
       $hba
         host  all  all  192.168.65.0/24  trust
         host  all  all  172.16.0.0/12    trust
     then: brew services restart postgresql@16"
  fi
else
  echo "  · could not read pg_hba.conf — skipping that check"
fi

[ "$CHECK_ONLY" = "1" ] && { echo; echo "Preflight passed."; exit 0; }

export POSTGRES_DB="$DB"
export POSTGRES_USER="${POSTGRES_USER:-${PGUSER:-$(whoami)}}"

step "Building"
"${COMPOSE[@]}" build

step "Migrations"
"${COMPOSE[@]}" run --rm backend python manage.py migrate --noinput

step "Seeding reference data (idempotent)"
"${COMPOSE[@]}" run --rm backend python manage.py seed_all

step "Starting the API on http://localhost:8000"
echo "  health   http://localhost:8000/api/v1/system/health"
echo "  logs     docker compose -f docker-compose.backend.yml logs -f"
echo "  stop     docker compose -f docker-compose.backend.yml down"
echo "  frontend scripts/dev-frontend.sh   (in another terminal)"
echo
exec "${COMPOSE[@]}" up
