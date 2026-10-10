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
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

/**
 * Refuse to ask for sign-in codes from an API that is not the e2e one.
 *
 * `serve-api.sh` pins the console SMS backend and logs to
 * $UB_E2E_LOGS/be-run.log. Anything else on :8000 — the owner's Docker stack,
 * `dev-backend.sh` — reads backend/.env and sends through Fast2SMS, so a
 * harness that typed made-up numbers into it would text strangers on a paid
 * account. That happened once (10 Oct 2026: Docker had taken the port, and
 * four OTP requests reached Fast2SMS, which happened to refuse them).
 *
 * The proof is the log: a health request carrying a fresh request id must
 * appear in the e2e server's own log file. If it does not, something else is
 * answering.
 */
export const assertE2eApi = async (backend = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1') => {
  const log = join(process.env.UB_E2E_LOGS ?? '/tmp/claude-0', 'be-run.log');
  const id = randomUUID().replace(/-/g, '');
  await fetch(`${backend}/system/health`, { headers: { 'X-Request-Id': id } }).catch(() => null);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (existsSync(log) && readFileSync(log, 'utf8').includes(id)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `The API at ${backend} is not the e2e server (its requests are not in ${log}). ` +
      'Refusing to request sign-in codes from it: it may send real SMS. Run e2e/serve-api.sh first.'
  );
};
