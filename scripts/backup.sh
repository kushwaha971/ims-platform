#!/usr/bin/env bash
# scripts/backup.sh — one backup cycle. Part 29 §29.5.1, materialised.
#
# Runs INSIDE the `backup` container (built from the backend image, which carries
# postgresql-client), where scripts/ is mounted at /opt/ops. It can also be run on
# demand during a deploy, which §29.6.2 step 2 requires:
#
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
#     exec -T backup /opt/ops/backup.sh
#
# ...or on a bare host / for a rehearsal, pointed at any server and media tree:
#
#   PGHOST=127.0.0.1 PGPASSWORD=… POSTGRES_USER=udhaarbook POSTGRES_DB=udhaarbook \
#   MEDIA_DIR=backend/media BACKUP_DIR=/tmp/ub-backups scripts/backup.sh
#
# What one cycle writes, all under ${BACKUP_DIR}, all stamped ${STAMP} (UTC):
#   daily/ub-<stamp>.dump          pg_dump --format=custom (compressed, parallel-restorable)
#   daily/ub-<stamp>.dump.sha256   its checksum
#   daily/ub-<stamp>.dump.verify   the ledger_entry row count of a TEST RESTORE of it
#   media/media-<stamp>.tar.gz     MEDIA_DIR as a tarball (+ .sha256)
#   weekly/                        Sunday's dump and media, hard-linked
#
# Step 3 is the one that matters: a backup is verified by restoring it into a
# throwaway database and counting rows, EVERY NIGHT. An unverified backup is a
# hypothesis. Step 5 is the only step that protects against losing the machine.
#
# Sprint 12: the media snapshot was `rsync --link-dest`, and neither the backend
# image nor this host has rsync, so under `set -e` every cycle died after the
# dump and before the verification. It is a tarball now (tar is everywhere);
# rsync is needed only for the optional off-host copy, and is checked for.
set -euo pipefail

: "${BACKUP_DIR:=/srv/backups}"
: "${POSTGRES_USER:?POSTGRES_USER required}"
: "${POSTGRES_DB:?POSTGRES_DB required}"
: "${BACKUP_KEEP_DAILY:=30}"
: "${BACKUP_KEEP_WEEKLY:=12}"
: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${MEDIA_DIR:=/srv/media}"
export PGHOST PGPORT

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
VERIFY_DB="verify_$(echo "${STAMP}" | tr 'A-Z' 'a-z')"
OUT="${BACKUP_DIR}/daily/ub-${STAMP}.dump"
MEDIA_OUT="${BACKUP_DIR}/media/media-${STAMP}.tar.gz"
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/media"
t0=$(date +%s)

# 1. Custom-format dump: compressed, parallel-restorable, selective-restorable.
pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --format=custom --compress=9 --no-owner --no-privileges \
        --file="${OUT}.tmp"
mv "${OUT}.tmp" "${OUT}"                       # atomic: a partial file is never named .dump
( cd "$(dirname "${OUT}")" && sha256sum "$(basename "${OUT}")" > "$(basename "${OUT}").sha256" )
t1=$(date +%s)

# 2. Media: one tarball per cycle. A missing MEDIA_DIR is a fresh install with
#    nothing uploaded yet, not an error — but it is said out loud.
if [ -d "${MEDIA_DIR}" ]; then
  tar -C "${MEDIA_DIR}" -czf "${MEDIA_OUT}.tmp" .
  mv "${MEDIA_OUT}.tmp" "${MEDIA_OUT}"
  ( cd "$(dirname "${MEDIA_OUT}")" && sha256sum "$(basename "${MEDIA_OUT}")" > "$(basename "${MEDIA_OUT}").sha256" )
else
  echo "{\"event\":\"backup.media_missing\",\"dir\":\"${MEDIA_DIR}\"}"
  MEDIA_OUT=""
fi
t2=$(date +%s)

# 3. Verify by restoring into a throwaway database and counting rows.
createdb -U "${POSTGRES_USER}" "${VERIFY_DB}"
trap 'dropdb -U "${POSTGRES_USER}" --if-exists "${VERIFY_DB}" || true' EXIT
pg_restore -U "${POSTGRES_USER}" -d "${VERIFY_DB}" --no-owner --no-privileges --jobs=2 "${OUT}"
psql -U "${POSTGRES_USER}" -d "${VERIFY_DB}" -tAc "SELECT count(*) FROM ledger_entry" > "${OUT}.verify"
dropdb -U "${POSTGRES_USER}" "${VERIFY_DB}"
trap - EXIT
t3=$(date +%s)

# 4. Weekly promotion (Sundays) and retention.
if [ "$(date -u +%u)" = "7" ]; then
  cp -l "${OUT}" "${OUT}.sha256" "${OUT}.verify" "${BACKUP_DIR}/weekly/"
  [ -n "${MEDIA_OUT}" ] && cp -l "${MEDIA_OUT}" "${MEDIA_OUT}.sha256" "${BACKUP_DIR}/weekly/"
fi
find "${BACKUP_DIR}/daily"  -name 'ub-*'    -mtime "+${BACKUP_KEEP_DAILY}"          -delete
find "${BACKUP_DIR}/media"  -name 'media-*' -mtime "+${BACKUP_KEEP_DAILY}"          -delete
find "${BACKUP_DIR}/weekly" -type f         -mtime "+$((BACKUP_KEEP_WEEKLY * 7))"   -delete

# 5. Off-host copy (the only step that protects against losing the machine).
if [ -n "${BACKUP_REMOTE_TARGET:-}" ]; then
  command -v rsync >/dev/null || { echo '{"event":"backup.no_rsync","level":"CRITICAL"}' >&2; exit 1; }
  rsync -az -e "ssh -i ${BACKUP_REMOTE_KEY} -o StrictHostKeyChecking=yes" \
        "${OUT}" "${OUT}.sha256" "${OUT}.verify" ${MEDIA_OUT:+"${MEDIA_OUT}" "${MEDIA_OUT}.sha256"} \
        "${BACKUP_REMOTE_TARGET}/"
fi
echo "{\"event\":\"backup.done\",\"file\":\"${OUT}\",\"bytes\":$(stat -c%s "${OUT}"),\"media\":\"${MEDIA_OUT}\",\"verified_rows\":$(cat "${OUT}.verify"),\"dump_s\":$((t1 - t0)),\"media_s\":$((t2 - t1)),\"verify_s\":$((t3 - t2))}"
