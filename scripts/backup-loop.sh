#!/usr/bin/env bash
# scripts/backup-loop.sh — the `backup` service's entrypoint. Part 29 §29.5.1:
# "The backup service runs ops/backup/loop.sh, which sleeps until BACKUP_HOUR_UTC
# and then [runs one backup cycle]."
#
# Deliberately not cron: one long-lived process, supervised by Docker's
# `restart: unless-stopped`, with its log on stdout like every other service.
set -euo pipefail

: "${BACKUP_HOUR_UTC:=20}"          # 01:30 IST ≈ 20:00 UTC
: "${BACKUP_DIR:=/srv/backups}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "{\"event\":\"backup.loop_start\",\"hour_utc\":${BACKUP_HOUR_UTC}}"

while true; do
  now_h=$(date -u +%-H)
  now_m=$(date -u +%-M)
  now_s=$(date -u +%-S)
  # Seconds from now until the next BACKUP_HOUR_UTC:00:00.
  secs_now=$(( now_h * 3600 + now_m * 60 + now_s ))
  secs_target=$(( BACKUP_HOUR_UTC * 3600 ))
  delta=$(( secs_target - secs_now ))
  [ "$delta" -le 0 ] && delta=$(( delta + 86400 ))
  echo "{\"event\":\"backup.sleep\",\"seconds\":${delta}}"
  sleep "$delta"

  if "${HERE}/backup.sh"; then
    :
  else
    rc=$?
    echo "{\"event\":\"backup.failed\",\"level\":\"CRITICAL\",\"exit_code\":${rc}}" >&2
    # Never exit: a failed dump must not take the supervisor down, and the
    # ops.verify_backup job (Part 20 §20.8.4, daily 04:15) is what raises the
    # alert when last night's dump is missing.
  fi
  sleep 60          # never run twice within the same minute
done
