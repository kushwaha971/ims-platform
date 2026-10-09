/**
 * e2e/lib/local.mjs — the two things a harness reaches outside HTTP for, so one
 * harness runs on the cloud workspace AND on the owner's Mac.
 *
 * Several harnesses read or set state the API does not expose through
 * `manage.py shell` or `psql`. They hard-coded the cloud workspace's shape —
 * a system `python` with Django installed and a `udhaarbook` role and database
 * — so on the Mac (a `.venv`, the developer's own role and `digikhaato_dev`)
 * they crashed before their first check and reported nothing at all.
 *
 *   PYTHON  — E2E_PYTHON, else the repo's `.venv/bin/python` when it exists,
 *             else `python` (the cloud workspace).
 *   psql    — E2E_DB_USER / E2E_DB_NAME / E2E_DB_PASSWORD, defaulting to the
 *             cloud workspace's `udhaarbook` on 127.0.0.1.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENV_PY = join(REPO, '.venv', 'bin', 'python');

/** The backend folder `manage.py` runs in: E2E_BACKEND_DIR, else this checkout's. */
export const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? join(REPO, 'backend');

export const PYTHON = process.env.E2E_PYTHON ?? (existsSync(VENV_PY) ? VENV_PY : 'python');

const DB_USER = process.env.E2E_DB_USER ?? 'udhaarbook';
const DB_NAME = process.env.E2E_DB_NAME ?? 'udhaarbook';
const DB_PASSWORD = process.env.E2E_DB_PASSWORD ?? 'udhaarbook';

/** Run one SQL statement and return its trimmed, unaligned output. */
export const psql = (sql) =>
  execFileSync('psql', ['-h', '127.0.0.1', '-U', DB_USER, DB_NAME, '-tAq', '-c', sql], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
  })
    .toString()
    .trim();
