#!/usr/bin/env bash
# scripts/restore.sh — Part 29 §29.11.7, "Restore from backup", as a script.
#
# THIS PROCEDURE DESTROYS THE CURRENT DATABASE. It refuses to do anything until
# you pass --yes-destroy-the-database, and even then it takes a pre-restore dump
# of what it is about to destroy first (step 4 of §29.11.7) — because even a
# corrupted database may hold transactions the dump does not.
#
# Usage:
#   scripts/restore.sh --dump /srv/udhaarbook/backups/daily/ub-<stamp>.dump \
#                      [--compose "docker compose -f docker-compose.yml -f docker-compose.prod.yml"] \
#                      [--media /srv/udhaarbook/backups/media/<day>] \
#                      [--skip-verify] --yes-destroy-the-database
#
# Steps 2 (maintenance mode) and 11 (tell every affected tenant what was lost)
# are NOT automated, on purpose: the first needs an operator's judgement about the
# outage window and the second is a human obligation. The script prints both.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose}"
DUMP=""
MEDIA=""
CONFIRMED=0
SKIP_VERIFY=0
DB_USER="${POSTGRES_USER:-udhaarbook}"
DB_NAME="${POSTGRES_DB:-udhaarbook}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dump)    DUMP="$2";    shift 2 ;;
    --media)   MEDIA="$2";   shift 2 ;;
    --compose) COMPOSE="$2"; shift 2 ;;
    --user)    DB_USER="$2"; shift 2 ;;
    --dbname)  DB_NAME="$2"; shift 2 ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --yes-destroy-the-database) CONFIRMED=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "restore: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "RESTORE ABORTED: $*" >&2; exit 1; }
say() { echo; echo "=== $*"; }

[ -n "$DUMP" ] || die "--dump is required"
[ -f "$DUMP" ] || die "dump not found: $DUMP"
[ "$CONFIRMED" = "1" ] || die "refusing to run without --yes-destroy-the-database"

# 1. Identify and verify the dump.
say "1. Verifying ${DUMP}"
if [ -f "${DUMP}.sha256" ]; then
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" ) \
    || die "checksum mismatch — this dump is not intact, pick another"
else
  echo "  no ${DUMP}.sha256 alongside the dump; continuing without a checksum (record this)"
fi
if [ -f "${DUMP}.verify" ]; then
  echo "  row count recorded at backup time: $(cat "${DUMP}.verify") ledger_entry rows"
fi

# 2. Announce. Not automated — the operator decides the outage window.
say "2. ANNOUNCE THE OUTAGE and put nginx into maintenance mode, then continue:"
echo "   cp nginx/conf.d/maintenance.conf.disabled nginx/conf.d/maintenance.conf && $COMPOSE exec nginx nginx -s reload"
read -r -p "   Maintenance mode is on and the outage is announced. Continue? [type RESTORE] " answer
[ "$answer" = "RESTORE" ] || die "not confirmed"

# 3. Stop the writers. Leave db running.
say "3. Stopping backend, scheduler, frontend, backup"
$COMPOSE stop backend scheduler frontend backup || true

# 4. Preserve the current state before destroying it.
say "4. Dumping the CURRENT database before it is destroyed"
PRE="$(dirname "$DUMP")/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
if $COMPOSE exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$PRE" 2>/dev/null; then
  echo "  saved: $PRE ($(stat -c%s "$PRE" 2>/dev/null || echo '?') bytes)"
else
  rm -f "$PRE"
  echo "  the server could not dump — continuing (this is the documented exception)"
fi

# 5. Recreate the database.
say "5. Terminating connections and recreating ${DB_NAME}"
$COMPOSE exec -T db psql -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}'" >/dev/null
$COMPOSE exec -T db dropdb   -U "$DB_USER" "$DB_NAME"
$COMPOSE exec -T db createdb -U "$DB_USER" "$DB_NAME"

# 6. Restore. Expect warnings about extensions; expect NO errors.
say "6. Restoring ${DUMP}"
$COMPOSE exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --jobs=2 < "$DUMP"

# 7. Media.
if [ -n "$MEDIA" ]; then
  say "7. Restoring media from ${MEDIA}"
  [ -d "$MEDIA" ] || die "media snapshot not found: $MEDIA"
  VOL="$(docker volume ls -q --filter name=ub_media | head -1)"
  [ -n "$VOL" ] || die "could not find the ub_media volume"
  MOUNT="$(docker volume inspect "$VOL" --format '{{.Mountpoint}}')"
  rsync -a "${MEDIA}/" "${MOUNT}/"
else
  say "7. Media not requested (--media); skipping"
fi

# 8. Bring up the backend only and check the schema is current.
say "8. Starting backend and checking migrations"
$COMPOSE up -d backend
sleep 5
if ! $COMPOSE exec -T backend python manage.py migrate --check; then
  echo "  migrations pending (the dump predates the deployed code) — applying them"
  $COMPOSE exec -T backend python manage.py migrate --noinput
fi

# 9. Verify the data BEFORE letting users in.
if [ "$SKIP_VERIFY" = "0" ]; then
  say "9. Verifying the restored data"
  $COMPOSE exec -T backend python manage.py check_integrity
  echo -n "  ledger_entry rows now: "
  $COMPOSE exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM ledger_entry"
  echo -n "  newest ledger_entry:   "
  $COMPOSE exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT max(created_at) FROM ledger_entry"
  if [ -f "${DUMP}.verify" ]; then
    echo "  recorded at backup time: $(cat "${DUMP}.verify")  — these must match"
  fi
fi

# 10. Start the rest.
say "10. Starting the remaining services"
$COMPOSE up -d
if [ -x "$(dirname "$0")/smoke.sh" ] && [ -n "${UB_PUBLIC_BASE_URL:-}" ]; then
  "$(dirname "$0")/smoke.sh" "$UB_PUBLIC_BASE_URL" || echo "  smoke test failed — investigate before removing maintenance mode"
fi
echo "   Remove maintenance mode:"
echo "   rm -f nginx/conf.d/maintenance.conf && $COMPOSE exec nginx nginx -s reload"

# 11 & 12. The two obligations the script cannot discharge for you.
cat <<'OBLIGATIONS'

=== 11. TELL EVERY AFFECTED TENANT WHAT WAS LOST.
    The gap between the dump's timestamp and the incident is data merchants
    entered and believe exists. Silence here is the failure that ends the
    relationship, not the outage.

=== 12. Write the incident up in ops/INCIDENTS.md with the RPO actually
    achieved. If it was worse than intended, schedule Part 29 §29.5.4 (PITR).
OBLIGATIONS
