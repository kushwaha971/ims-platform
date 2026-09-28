#!/usr/bin/env bash
# scripts/restore.sh — Part 29 §29.11.7, "Restore from backup", as a script.
#
# THIS PROCEDURE DESTROYS THE TARGET DATABASE. It refuses to do anything until
# you pass --yes-destroy-the-database, and even then it takes a pre-restore dump
# of what it is about to destroy first (step 4 of §29.11.7) — because even a
# corrupted database may hold transactions the dump does not.
#
# Usage (production, through compose — the default):
#   scripts/restore.sh --dump /srv/udhaarbook/backups/daily/ub-<stamp>.dump \
#                      [--compose "docker compose -f docker-compose.yml -f docker-compose.prod.yml"] \
#                      [--media /srv/udhaarbook/backups/media/media-<stamp>.tar.gz] \
#                      [--skip-verify] --yes-destroy-the-database
#
# Usage (--local: a bare host, a staging box without compose, or a REHEARSAL
# into a throwaway database — talks to PostgreSQL through PGHOST/PGPORT/PGPASSWORD
# and runs manage.py from backend/ with POSTGRES_DB pointed at the target):
#   PGHOST=127.0.0.1 PGPASSWORD=… scripts/restore.sh --local \
#       --dump /tmp/ub-backups/daily/ub-<stamp>.dump --dbname ub_restore_rehearsal \
#       --media /tmp/ub-backups/media/media-<stamp>.tar.gz --media-root /tmp/ub-restored-media \
#       --non-interactive --yes-destroy-the-database
#
# Steps 2 (maintenance mode) and 11 (tell every affected tenant what was lost)
# are NOT automated, on purpose: the first needs an operator's judgement about the
# outage window and the second is a human obligation. The script prints both.
# Every step prints its elapsed seconds, so a drill records its RTO as it runs.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="${COMPOSE:-docker compose}"
DUMP=""
MEDIA=""
MEDIA_ROOT=""
CONFIRMED=0
SKIP_VERIFY=0
LOCAL=0
INTERACTIVE=1
DB_USER="${POSTGRES_USER:-udhaarbook}"
DB_NAME="${POSTGRES_DB:-udhaarbook}"
BACKEND_DIR="${BACKEND_DIR:-${HERE}/../backend}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dump)       DUMP="$2";       shift 2 ;;
    --media)      MEDIA="$2";      shift 2 ;;
    --media-root) MEDIA_ROOT="$2"; shift 2 ;;
    --compose)    COMPOSE="$2";    shift 2 ;;
    --user)       DB_USER="$2";    shift 2 ;;
    --dbname)     DB_NAME="$2";    shift 2 ;;
    --local)      LOCAL=1;         shift ;;
    --non-interactive) INTERACTIVE=0; shift ;;
    --skip-verify) SKIP_VERIFY=1;  shift ;;
    --yes-destroy-the-database) CONFIRMED=1; shift ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "restore: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "RESTORE ABORTED: $*" >&2; exit 1; }
START=$(date +%s)
LAST=$START
say() {
  now=$(date +%s)
  echo; echo "=== [+$((now - START))s, previous step $((now - LAST))s] $*"
  LAST=$now
}

# One spelling of each database command for both modes.
if [ "$LOCAL" = "1" ]; then
  pg()      { "$@"; }                      # psql / pg_dump / dropdb / createdb / pg_restore via PGHOST
  manage()  { ( cd "$BACKEND_DIR" && POSTGRES_DB="$DB_NAME" python3 manage.py "$@" ); }
else
  pg()      { $COMPOSE exec -T db "$@"; }
  manage()  { $COMPOSE exec -T backend python manage.py "$@"; }
fi

[ -n "$DUMP" ] || die "--dump is required"
[ -f "$DUMP" ] || die "dump not found: $DUMP"
[ "$CONFIRMED" = "1" ] || die "refusing to run without --yes-destroy-the-database"
if [ "$LOCAL" = "1" ] && [ "$DB_NAME" = "udhaarbook" ] && [ "$INTERACTIVE" = "0" ]; then
  die "--local --non-interactive will not overwrite a database called 'udhaarbook'; name a throwaway --dbname"
fi

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
if [ "$INTERACTIVE" = "1" ]; then
  read -r -p "   Maintenance mode is on and the outage is announced. Continue? [type RESTORE] " answer
  [ "$answer" = "RESTORE" ] || die "not confirmed"
else
  echo "   (--non-interactive: skipped — a rehearsal has no users to announce to)"
fi

# 3. Stop the writers. Leave db running.
if [ "$LOCAL" = "1" ]; then
  say "3. --local: stop anything that writes to ${DB_NAME} yourself (runserver, run_scheduler)"
else
  say "3. Stopping backend, scheduler, frontend, backup"
  $COMPOSE stop backend scheduler frontend backup || true
fi

# 4. Preserve the current state before destroying it.
say "4. Dumping the CURRENT ${DB_NAME} before it is destroyed"
PRE="$(dirname "$DUMP")/pre-restore-${DB_NAME}-$(date -u +%Y%m%dT%H%M%SZ).dump"
EXISTS=$(pg psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)
if [ "$EXISTS" != "1" ]; then
  echo "  ${DB_NAME} does not exist yet — nothing to preserve"
elif pg pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$PRE" 2>/dev/null; then
  echo "  saved: $PRE ($(stat -c%s "$PRE" 2>/dev/null || echo '?') bytes)"
else
  rm -f "$PRE"
  echo "  the server could not dump — continuing (this is the documented exception)"
fi

# 5. Recreate the database.
say "5. Terminating connections and recreating ${DB_NAME}"
pg psql -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}'" >/dev/null
pg dropdb   -U "$DB_USER" --if-exists "$DB_NAME"
pg createdb -U "$DB_USER" "$DB_NAME"

# 6. Restore. Expect warnings about extensions; expect NO errors.
say "6. Restoring ${DUMP}"
if [ "$LOCAL" = "1" ]; then
  pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges --jobs=2 "$DUMP"
else
  pg pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges < "$DUMP"
fi

# 7. Media.
if [ -n "$MEDIA" ]; then
  say "7. Restoring media from ${MEDIA}"
  if [ -z "$MEDIA_ROOT" ]; then
    [ "$LOCAL" = "1" ] && die "--local needs --media-root to restore media into"
    VOL="$(docker volume ls -q --filter name=ub_media | head -1)"
    [ -n "$VOL" ] || die "could not find the ub_media volume"
    MEDIA_ROOT="$(docker volume inspect "$VOL" --format '{{.Mountpoint}}')"
  fi
  mkdir -p "$MEDIA_ROOT"
  if [ -f "$MEDIA" ]; then
    if [ -f "${MEDIA}.sha256" ]; then
      ( cd "$(dirname "$MEDIA")" && sha256sum -c "$(basename "$MEDIA").sha256" ) \
        || die "media checksum mismatch"
    fi
    tar -C "$MEDIA_ROOT" -xzf "$MEDIA"
  elif [ -d "$MEDIA" ]; then
    cp -a "${MEDIA}/." "${MEDIA_ROOT}/"
  else
    die "media snapshot not found: $MEDIA"
  fi
  echo "  files now under ${MEDIA_ROOT}: $(find "$MEDIA_ROOT" -type f | wc -l)"
else
  say "7. Media not requested (--media); skipping"
fi

# 8. Bring up the backend only and check the schema is current.
say "8. Checking migrations against the restored ${DB_NAME}"
[ "$LOCAL" = "1" ] || { $COMPOSE up -d backend; sleep 5; }
if ! manage migrate --check; then
  echo "  migrations pending (the dump predates the deployed code) — applying them"
  manage migrate --noinput
fi

# 9. Verify the data BEFORE letting users in.
if [ "$SKIP_VERIFY" = "0" ]; then
  say "9. Verifying the restored data"
  manage check
  manage check_invariants          # read-only; exits 1 on any balance or stock drift
  echo -n "  ledger_entry rows now: "
  pg psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM ledger_entry"
  echo -n "  newest ledger_entry:   "
  pg psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT max(created_at) FROM ledger_entry"
  if [ -f "${DUMP}.verify" ]; then
    now_rows=$(pg psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM ledger_entry")
    [ "$now_rows" = "$(cat "${DUMP}.verify")" ] \
      || die "ledger_entry count ${now_rows} != ${DUMP}.verify $(cat "${DUMP}.verify")"
    echo "  matches the count recorded at backup time"
  fi
fi

# 10. Start the rest.
if [ "$LOCAL" = "1" ]; then
  say "10. --local: start the services against ${DB_NAME} yourself"
else
  say "10. Starting the remaining services"
  $COMPOSE up -d
  if [ -x "${HERE}/smoke.sh" ] && [ -n "${UB_PUBLIC_BASE_URL:-}" ]; then
    "${HERE}/smoke.sh" "$UB_PUBLIC_BASE_URL" || echo "  smoke test failed — investigate before removing maintenance mode"
  fi
  echo "   Remove maintenance mode:"
  echo "   rm -f nginx/conf.d/maintenance.conf && $COMPOSE exec nginx nginx -s reload"
fi
echo; echo "=== restore finished in $(( $(date +%s) - START ))s"

# 11 & 12. The two obligations the script cannot discharge for you.
cat <<'OBLIGATIONS'

=== 11. TELL EVERY AFFECTED TENANT WHAT WAS LOST.
    The gap between the dump's timestamp and the incident is data merchants
    entered and believe exists. Silence here is the failure that ends the
    relationship, not the outage.

=== 12. Write the incident up in ops/INCIDENTS.md with the RPO actually
    achieved. If it was worse than intended, schedule Part 29 §29.5.4 (PITR).
OBLIGATIONS
