#!/usr/bin/env bash
# scripts/bootstrap.sh — Part 29 §29.4.1, "From a clean clone to a working app",
# executed rather than copy-pasted, followed by §29.4.3's verification checklist.
#
# Prerequisites: Docker Engine >= 24 with Compose v2, 8 GB RAM, 10 GB free disk,
# ports 3000 / 8000 / 5432 free. The script checks all of them before touching
# anything.
#
# Usage:
#   scripts/bootstrap.sh              # full sequence, interactive super admin
#   scripts/bootstrap.sh --demo       # also run seed_demo (~120 ledger entries)
#   scripts/bootstrap.sh --no-superadmin   # skip step 7 (CI, or a re-run)
#   scripts/bootstrap.sh --verify-only     # just §29.4.3's checklist
#
# Step 5 is a separate, explicit step and always will be: the entrypoint waits
# for the database and execs, it never migrates (§29.5.2).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEMO=0
SUPERADMIN=1
VERIFY_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --demo)           DEMO=1;        shift ;;
    --no-superadmin)  SUPERADMIN=0;  shift ;;
    --verify-only)    VERIFY_ONLY=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "bootstrap: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

STARTED_AT=$(date +%s)
step()  { echo; echo "── $* ────────────────────────────────────────────"; }
ok()    { echo "  ✓ $*"; }
bad()   { echo "  ✗ $*" >&2; FAILURES=$((FAILURES + 1)); }
die()   { echo "BOOTSTRAP FAILED: $*" >&2; exit 1; }
FAILURES=0

# ── 0. Preconditions ─────────────────────────────────────────────────────────
preflight() {
  step "0. Preconditions"
  command -v docker >/dev/null || die "docker is not installed"
  docker compose version >/dev/null 2>&1 || die "Compose v2 is not available (\`docker compose\`)"
  ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'), compose v2"

  avail_kb=$(df -Pk . | awk 'NR==2 {print $4}')
  [ "$avail_kb" -gt $((10 * 1024 * 1024)) ] || die "less than 10 GB free on $(pwd)"
  ok "$((avail_kb / 1024 / 1024)) GB free disk"

  for port in 3000 8000 5432; do
    if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then
      die "port $port is already in use"
    fi
  done
  ok "ports 3000, 8000, 5432 free"
}

# ── 2. Environment file ──────────────────────────────────────────────────────
make_env() {
  step "2. Environment file"
  if [ -f .env ]; then
    ok ".env already exists — leaving it alone"
  else
    cp .env.example .env
    chmod 600 .env
    python3 -c "import secrets; print('UB_SECRET_KEY=' + secrets.token_urlsafe(64))" >> .env
    python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))" >> .env
    ok ".env created from .env.example with a generated UB_SECRET_KEY and POSTGRES_PASSWORD"
    echo "    Review UB_DEFAULT_TIMEZONE, UB_PUBLIC_BASE_URL and the published ports before production."
  fi
}

# ── 3-9. The sequence ────────────────────────────────────────────────────────
build()      { step "3. Building images (first build ≈ 4–7 min)"; docker compose build; }
start_db()   {
  step "4. Starting the database and waiting for it to be healthy"
  docker compose up -d db
  "$ROOT/scripts/wait-for-db.sh" --compose --timeout 180
  docker compose ps db
}
migrate()    {
  step "5. Migrations — explicit, because the entrypoint never runs them (§29.5.2)"
  docker compose run --rm backend python manage.py migrate --noinput
}
seed()       {
  step "6. Seeding reference data (idempotent; safe to re-run)"
  docker compose run --rm backend python manage.py seed_all
}
superadmin() {
  [ "$SUPERADMIN" = "1" ] || { echo "  (skipped: --no-superadmin)"; return 0; }
  step "7. Creating the super admin (interactive: mobile, name, password)"
  docker compose run --rm backend python manage.py create_superadmin
}
demo()       {
  [ "$DEMO" = "1" ] || return 0
  step "6b. Demo data (seed_demo refuses under DEBUG=0 without --force)"
  docker compose run --rm backend python manage.py seed_demo
}
start_all()  {
  step "8. Starting everything"
  docker compose up -d
  step "9. Waiting for every service to report healthy"
  for _ in $(seq 1 60); do
    unhealthy=$(docker compose ps --format '{{.Service}} {{.Health}}' \
                 | awk '$2 != "healthy" && $2 != "" {print $1}' | tr '\n' ' ')
    [ -z "$unhealthy" ] && { ok "all services healthy"; return 0; }
    sleep 5
  done
  echo "  still not healthy: ${unhealthy:-unknown}" >&2
  docker compose ps
  return 1
}

# ── §29.4.3 Verification checklist ───────────────────────────────────────────
verify() {
  step "§29.4.3 Verification checklist — every line must pass"

  echo "  Infrastructure"
  n=$(docker compose ps --format '{{.Service}} {{.Health}}' | awk '$2=="healthy"' | wc -l)
  [ "$n" -ge 4 ] && ok "$n services healthy" || bad "only $n services healthy (expected >= 4)"
  docker compose exec -T db pg_isready >/dev/null 2>&1 \
    && ok "db accepting connections" || bad "pg_isready failed"
  health=$(curl -sf localhost:8000/api/v1/system/health || true)
  echo "$health" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' \
    && ok "/system/health status ok" || bad "/system/health not ok: ${health:-<no response>}"
  echo "$health" | grep -q '"migrations"[[:space:]]*:[[:space:]]*"applied"' \
    && ok "migrations applied" || bad "/system/health does not report migrations applied"
  echo "$health" | grep -q '"scheduler"' \
    && ok "scheduler reported in health" || bad "no scheduler block in /system/health"
  curl -sf localhost:8000/api/v1/system/version | grep -q '"version"' \
    && ok "/system/version present" || bad "/system/version missing"

  echo "  Migrations and seeds"
  docker compose exec -T backend python manage.py migrate --check >/dev/null 2>&1 \
    && ok "migrate --check clean (nothing pending)" || bad "migrate --check reports pending migrations"
  pending=$(docker compose exec -T backend python manage.py showmigrations 2>/dev/null | grep -c '\[ \]' || true)
  [ "${pending:-1}" = "0" ] && ok "no unapplied migrations" || bad "$pending unapplied migration(s)"
  rates=$(docker compose exec -T backend python manage.py shell -c \
    "from tax.models import TaxRate; print(TaxRate.objects.count())" 2>/dev/null | tr -d '\r' | tail -1 || echo 0)
  [ "${rates:-0}" -gt 0 ] 2>/dev/null && ok "tax rates seeded ($rates)" || bad "no tax rates seeded"
  docker compose run --rm backend python manage.py seed_all >/dev/null 2>&1 \
    && ok "seed_all re-run is a no-op" || bad "seed_all is not idempotent"

  echo "  Scheduler"
  docker compose exec -T scheduler python manage.py scheduler_health --max-age 300 >/dev/null 2>&1 \
    && ok "scheduler_health exits 0" || bad "scheduler_health non-zero — no recent heartbeat"
  docker compose logs scheduler --tail 20 2>/dev/null | grep -q 'scheduler.tick' \
    && ok "scheduler ticks visible in the log" || bad "no scheduler.tick lines in the last 20 log lines"

  echo "  Frontend"
  [ "$(curl -so /dev/null -w '%{http_code}' localhost:3000)" = "200" ] \
    && ok "frontend returns 200" || bad "frontend did not return 200"
  curl -sf localhost:3000/api/healthz >/dev/null \
    && ok "/api/healthz ok" || bad "/api/healthz failed"

  cat <<'MANUAL'

  Then, in the browser, the functional checklist (§29.4.3). These are not
  automatable here and are the operator's sign-off:

  [ ] Sign up with a mobile; the OTP appears in `docker compose logs backend`
  [ ] Complete onboarding; land on the dashboard with the product theme, no flash
  [ ] Create a party; record "You gave ₹500"; balance ₹500, "You will get", red tone
  [ ] Create an item with opening stock; create and issue an invoice; the number
      follows the series; stock decreases; the party balance increases
  [ ] Open the invoice print view; branding and totals render; Save as PDF offered
  [ ] Record a payment; the invoice becomes partially paid; the statement shows
      both rows with a correct running balance
  [ ] Switch the language to Hindi; the primary screens are translated
  [ ] Settings → Branding: upload a logo, set a colour, confirm the theme changes
      live and a low-contrast colour is rejected with a suggestion
  [ ] `docker compose down && docker compose up -d`; all data is still present
MANUAL
}

if [ "$VERIFY_ONLY" = "1" ]; then
  verify
  echo
  [ "$FAILURES" = "0" ] && { echo "VERIFICATION PASSED"; exit 0; }
  echo "VERIFICATION FAILED: $FAILURES check(s)" >&2; exit 1
fi

preflight
make_env
build
start_db
migrate
seed
demo
superadmin
start_all
verify

ELAPSED=$(( $(date +%s) - STARTED_AT ))
echo
echo "────────────────────────────────────────────────────────────"
printf 'Bootstrap finished in %dm %02ds with %d failed check(s).\n' \
  $((ELAPSED / 60)) $((ELAPSED % 60)) "$FAILURES"
echo "Record this timing in README.md — Sprint 0's exit criteria require it"
echo "(Part 32 §32.3.7: \"the Part 29 §29.4.1 bootstrap sequence executed"
echo "verbatim, timed, and the timings recorded in the README\")."
echo "Open http://localhost:3000"
echo "────────────────────────────────────────────────────────────"
exit $([ "$FAILURES" = "0" ] && echo 0 || echo 1)
