#!/usr/bin/env bash
# scripts/backup.sh — one backup cycle. Part 29 §29.5.1, materialised.
#
# Runs INSIDE the `backup` container (built from the backend image, which carries
# postgresql-client-16), where scripts/ is mounted at /opt/ops. It can also be run
# on demand during a deploy, which §29.6.2 step 2 requires:
#
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
#     exec -T backup /opt/ops/backup.sh
#
# Step 3 is the one that matters: a backup is verified by restoring it into a
# throwaway database and counting rows, EVERY NIGHT. An unverified backup is a
# hypothesis. Step 5 is the only step that protects against losing the machine.
set -euo pipefail

: "${BACKUP_DIR:=/srv/backups}"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${BACKUP_KEEP_DAILY:=30}"
: "${BACKUP_KEEP_WEEKLY:=12}"
: "${PGHOST:=db}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DAY=$(date -u +%Y%m%d)
OUT="${BACKUP_DIR}/daily/ub-${STAMP}.dump"
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/media"

# 1. Custom-format dump: compressed, parallel-restorable, selective-restorable.
pg_dump -h "${PGHOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --format=custom --compress=9 --no-owner --no-privileges \
        --file="${OUT}.tmp"
mv "${OUT}.tmp" "${OUT}"                       # atomic: a partial file is never named .dump
sha256sum "${OUT}" > "${OUT}.sha256"

# 2. Media: incremental hard-link snapshot (cheap; media is append-mostly).
if [ -d /srv/media ]; then
  rsync -a --delete --link-dest="${BACKUP_DIR}/media/latest" \
        /srv/media/ "${BACKUP_DIR}/media/${DAY}/"
  ln -sfn "${BACKUP_DIR}/media/${DAY}" "${BACKUP_DIR}/media/latest"
fi

# 3. Verify by restoring into a throwaway database and counting rows.
createdb -h "${PGHOST}" -U "${POSTGRES_USER}" "verify_${DAY}"
trap 'dropdb -h "${PGHOST}" -U "${POSTGRES_USER}" --if-exists "verify_${DAY}" || true' EXIT
pg_restore -h "${PGHOST}" -U "${POSTGRES_USER}" -d "verify_${DAY}" --no-owner --jobs=2 "${OUT}"
psql -h "${PGHOST}" -U "${POSTGRES_USER}" -d "verify_${DAY}" -tAc \
  "SELECT count(*) FROM ledger_entry" > "${OUT}.verify"
dropdb -h "${PGHOST}" -U "${POSTGRES_USER}" "verify_${DAY}"
trap - EXIT

# 4. Weekly promotion (Sundays) and retention.
[ "$(date -u +%u)" = "7" ] && cp -l "${OUT}" "${BACKUP_DIR}/weekly/"
find "${BACKUP_DIR}/daily"  -name '*.dump' -mtime "+${BACKUP_KEEP_DAILY}"        -delete
find "${BACKUP_DIR}/weekly" -name '*.dump' -mtime "+$((BACKUP_KEEP_WEEKLY * 7))" -delete
find "${BACKUP_DIR}/media"  -maxdepth 1 -type d -mtime "+${BACKUP_KEEP_DAILY}"   -exec rm -rf {} +

# 5. Off-host copy (the only step that protects against losing the machine).
[ -n "${BACKUP_REMOTE_TARGET:-}" ] && \
  rsync -az -e "ssh -i ${BACKUP_REMOTE_KEY} -o StrictHostKeyChecking=yes" \
        "${OUT}" "${OUT}.sha256" "${BACKUP_REMOTE_TARGET}/"
echo "{\"event\":\"backup.done\",\"file\":\"${OUT}\",\"bytes\":$(stat -c%s "${OUT}"),\"verified_rows\":$(cat "${OUT}.verify")}"
