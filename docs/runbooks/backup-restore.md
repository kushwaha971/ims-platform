# Backup and restore — procedure and rehearsal record

Part 29 §29.5.1 and §29.11.7, Part 27 §27.7.4, Part 12 §12.8 ("Automated
database backup with a **restore** rehearsed and timed, not merely
configured"). Part 35 §35.6's evidence rule applies: this file is the dated
record, and the timings below were measured, not estimated.

## 1. The two scripts

| Script | What it does | Where it runs |
|---|---|---|
| `scripts/backup.sh` | One cycle. (1) `pg_dump --format=custom --compress=9` to `daily/ub-<UTC stamp>.dump` plus `.sha256`; (2) `MEDIA_DIR` as `media/media-<stamp>.tar.gz` plus `.sha256`; (3) restores the dump into a throwaway `verify_<stamp>` database, writes its `ledger_entry` count to `.dump.verify`, drops it; (4) Sunday hard-links into `weekly/`, then retention (`BACKUP_KEEP_DAILY` days, `BACKUP_KEEP_WEEKLY` weeks); (5) off-host `rsync` when `BACKUP_REMOTE_TARGET` is set. Prints one JSON line with per-step seconds. | The compose `backup` service (`scripts/backup-loop.sh`, nightly at `BACKUP_HOUR_UTC`), `make backup`, or any host with `PGHOST`/`PGPASSWORD`/`MEDIA_DIR` set. |
| `scripts/restore.sh` | §29.11.7 as a script: checksum → announce → stop writers → **dump the database it is about to destroy** → drop/create → `pg_restore` → media → `migrate --check` (applies pending) → `manage.py check`, `check_invariants`, `ledger_entry` count **must equal** `.dump.verify` → start services → the two human obligations. Every step prints elapsed seconds. | Compose by default (`make restore DUMP=…`); `--local` for a bare host or a rehearsal into a throwaway `--dbname`. Refuses without `--yes-destroy-the-database`; `--local --non-interactive` refuses to touch a database named `udhaarbook`. |

Environment for `backup.sh`: `POSTGRES_USER`, `POSTGRES_DB` (required),
`PGHOST` (default `db`), `PGPORT`, `PGPASSWORD`, `MEDIA_DIR` (default
`/srv/media`), `BACKUP_DIR` (default `/srv/backups`), `BACKUP_KEEP_DAILY` (30),
`BACKUP_KEEP_WEEKLY` (12), `BACKUP_REMOTE_TARGET` / `BACKUP_REMOTE_KEY`.

## 2. Rehearsal — 28 Sep 2026, 13:57–14:00 UTC

**Machine:** the cloud dev box (2 vCPU, 8 GB, PostgreSQL 16.13, no Docker
daemon), so the `--local` path was used; the compose path differs only in
`docker compose exec -T db` wrapping the same commands.

**Source:** the live `udhaarbook` database the dev/e2e stack writes to —
987 tenants, 1,160 users, 4,107 parties, 7,232 ledger entries, 63 sales
documents, 18 purchase documents, 39 payments, 128 stock movements,
23,115 audit rows, 13 attachments (220 KB of media). `pg_database_size`
reports 121 MB (indexes and bloat); the custom-format dump is 4.6 MB.

**Target:** a throwaway database `ub_h1_restore_rehearsal`, dropped afterwards.

### 2.1 Commands, exactly as run

```bash
# backup (13:57:02Z)
PGHOST=127.0.0.1 PGPASSWORD=… POSTGRES_USER=udhaarbook POSTGRES_DB=udhaarbook \
MEDIA_DIR=/home/claude/repo/backend/media BACKUP_DIR=$R/backups scripts/backup.sh

# restore (13:58:04Z)
PGHOST=127.0.0.1 PGPASSWORD=… scripts/restore.sh --local \
  --dump $R/backups/daily/ub-20260928T135702Z.dump --dbname ub_h1_restore_rehearsal \
  --media $R/backups/media/media-20260928T135702Z.tar.gz --media-root $R/restored-media \
  --non-interactive --yes-destroy-the-database

# independent verification against the restored copy
POSTGRES_DB=ub_h1_restore_rehearsal python3 manage.py check
POSTGRES_DB=ub_h1_restore_rehearsal python3 manage.py migrate --check
POSTGRES_DB=ub_h1_restore_rehearsal python3 manage.py check_invariants
psql … -f compare.sql      # same 13 counts/sums on source and restore, diffed
diff -r backend/media $R/restored-media
```

### 2.2 Timings (wall clock)

| Step | Seconds |
|---|---|
| Backup: `pg_dump` (4.6 MB) | 2 |
| Backup: media tarball (13 files) | < 1 |
| Backup: verification restore into `verify_<stamp>` + count | 2 |
| **Backup total** | **4** |
| Restore 1: checksum | < 1 |
| Restore 4: pre-restore dump of the target | 1 |
| Restore 5: terminate, drop, create | 1 |
| Restore 6: `pg_restore --jobs=2` | 1 |
| Restore 7: media checksum + untar | < 1 |
| Restore 8: `migrate --check` | 1 |
| **Restore total (script)** | **4** |
| Verification: `manage.py check` + `migrate --check` | 2 |
| Verification: `check_invariants` (full balance + stock replay) | 1 |
| **Data back and verified** | **≈ 10 s** |

**RTO at this size: ~10 seconds of machine time**, plus whatever the operator
spends on the maintenance page and the announcement. The §29.5.1 target is
≤ 30 minutes; the headroom is large, and the dump and restore scale roughly
linearly, so a 100× larger book is still minutes. **RPO: 24 h** (nightly dump) —
visible in the rehearsal itself: two `auth.login_succeeded` audit rows written
to the source at 13:58:12Z and 13:58:29Z, after the 13:57:02Z dump, are the only
difference between source and restore (23,117 vs 23,115 audit rows).

### 2.3 Verification results

* `manage.py check`: no issues. `migrate --check`: nothing pending.
* Row counts and sums, source vs restore — identical for `ledger_entry` (7,232),
  `parties_party`, `platform_tenant`, `platform_user`, `sales_document`,
  `purchases_document`, `payments_payment`, `inventory_stock_movement`,
  `files_attachment`, Σ party balance, Σ ledger amount and the newest ledger
  timestamp; `platform_audit_log` differs by the two post-dump rows above.
* `ledger_entry` count equals `ub-….dump.verify` (7,232), which `restore.sh`
  now enforces.
* Media: `diff -r` of source and restored trees — identical, checksums OK.
* `check_invariants`: **300 balance drifts, 0 stock drifts — and the identical
  300 on the source** (`diff` of the two reports is empty), so the restore is
  faithful. They are all parties of the e2e "Kumar Stores" tenants whose
  `balance` was seeded without ledger entries: fixture data, not a product or
  restore defect. On a real restore the script stops at this step (exit 1),
  which is the intended behaviour; the rehearsal was re-run with
  `--skip-verify` and the verification done by hand as above. `recalc_stock`:
  0 drifted.

### 2.4 Defects the rehearsal found (all fixed on this branch)

1. **Every nightly backup died after the dump.** Step 2 used `rsync
   --link-dest`, and neither the backend image (the `backup` service's image)
   nor this host has `rsync`; under `set -e` the cycle exited before the
   verification restore and retention ran. Media is now a tarball; `rsync` is
   needed only for the optional off-host copy and is checked for explicitly.
2. **The restore's verification step could never fail.** It called
   `manage.py check_integrity`, which does not exist; the command that does,
   `check_invariants`, was still the Sprint 0 shell that printed "0
   violations" and exited 0. `check_invariants` now replays balances and stock
   (the same selectors as the nightly jobs) and exits 1 on drift, and the
   script also compares the restored `ledger_entry` count with `.dump.verify`.
3. **The compose restore used `pg_restore --jobs=2` on standard input**, which
   PostgreSQL refuses ("parallel restore from standard input is not
   supported"). Compose mode now restores serially from stdin; `--local`
   restores in parallel from the file.
4. Two backups on the same day collided on the `verify_<day>` database name;
   it is `verify_<stamp>` now, and the checksum files are written with
   relative names so `sha256sum -c` works from any directory.

## 3. The other §29.11 runbooks, walked once

Walked on the same box on 28 Sep 2026: every read-only command was run; a
command that does not exist is a finding. Those marked *fixed* are fixed on
this branch; the rest are open.

| Runbook | Walk | Gaps |
|---|---|---|
| 29.11.1 App down | `/system/health` (200 `{status, env}`), `/system/ready` (`database: ok`), `/system/version` answered. Smoke test run against a server built from this branch: **SMOKE OK**. | *Fixed:* `scripts/smoke.sh` (the runbook's `./ops/smoke.sh`) could not pass — it asserted `checks.migrations` / `checks.scheduler` in `/system/health`, which the endpoint does not return (§29.3.4 specifies them), and fetched `/api/v1/public/branding`, which does not exist. It now checks what exists, plus nosniff and the share route's noindex / no-referrer. It takes an optional second argument for a separate API origin (local). **Open:** `/system/health` lacks §29.3.4's `checks` block (scheduler age, queue depth, failed_24h, media writable). `ops/INCIDENTS.md` does not exist yet. The runbook says `./ops/…`; the scripts are in `scripts/`. |
| 29.11.2 Database down | `pg_stat_activity` by state (5 / 2 active / 14 idle), idle-in-transaction list (empty), ungranted locks (0) — all run. | *Fixed:* step 8's `check_integrity` → `check_invariants`, now real. Note: §29.11.2 step 6 is exactly the failure QA hit under CPU load; the root cause (hashing inside `atomic()`) is fixed on this branch. |
| 29.11.3 Scheduler stuck | `scheduler_health --max-age 300` → `ok`, exit 0. Advisory-lock query, running-jobs-by-type and failed-jobs queries run. | Runbook spells the columns `kind`/`status='failed'`; the table has `job_type` and `dead_letter`. `run_scheduler --once --reclaim` does not exist: use `run_scheduler --interval 0` (drain once; reaping happens on every tick). `run_scheduler --task ledger.reminders_due --date …` does not exist: use `enqueue_scheduled --period daily` (the job is `ledger.schedule_auto_reminders`; its child tokens carry the date, so a re-run cannot duplicate — proven by `test_scheduled_double_run.py`). `requeue_job <id>` exists (dry run unless `--yes`). *Fixed:* `check_expected_runs` no longer reports the eight never-built schedules as MISSING every hour. |
| 29.11.4 Disk full | `df -h`: 59 % used. | `manage.py expire_exports --force` does not exist (it is the `reports.expire_exports` / `platform.expire_tenant_exports` jobs; run `run_scheduler --interval 0 --job-types reports.expire_exports` after enqueueing). The `ops.check_disk` job does not exist. |
| 29.11.5 Failed migration | Invalid-index query run (none). `showmigrations`, `migrate --check` run. | None found. |
| 29.11.6 Certificate expiry | Not executable here (no nginx, no certbot). | No `certbot` service in `docker-compose.prod.yml`; `ops.check_certificates` is scheduled with no handler (reported as *unbuilt* now). nginx could not be run here: **run `nginx -t` on staging** before the next deploy, since this branch changed `nginx.conf` (log maps) and `app.conf` (`/d/` to the frontend, header include). |
| 29.11.7 Restore from backup | Rehearsed end to end above. | `ops.verify_backup` (scheduled, 04:15 IST) has no handler; the nightly verification is the backup script's own step 3, and a failed cycle is only visible as `backup.failed` in the `backup` container's log. |

## 4. Next drill

Monthly (§29.5.1), on staging, against the newest production dump, with
`make restore DUMP=…` (compose path, serial restore) — the rehearsal above
exercised the `--local` path. Record the date, dump size, per-step seconds
from the script's own output, and any deviation, in a new section here.
