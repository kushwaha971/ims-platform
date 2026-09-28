#!/usr/bin/env node
/**
 * e2e/run-regression.mjs — the whole browser regression, concurrently, in
 * one command.
 *
 *   node e2e/run-regression.mjs                  # everything (≈10 min on a 2-core box)
 *   node e2e/run-regression.mjs --quick          # smoke subset (≤3 min)
 *   node e2e/run-regression.mjs --only s3-B,ledger   # by id, group (s3, d2, d3, core, a11y) or prefix*
 *   node e2e/run-regression.mjs --skip journey   # everything but
 *   node e2e/run-regression.mjs --list           # what would run, and the fixtures each gets
 *   node e2e/run-regression.mjs -j 4             # concurrency (default 6)
 *
 *   Tuning: --timeout <s> per job (720) · --start-gap <ms> between starts (2500)
 *   · --min-free-mb <MB> needed to start another job (600) · --no-retry
 *
 * Output: /tmp/e2e-shots/regress-<timestamp>/ — one directory per job (its
 * screenshots and state), `<job>.log` (stdout+stderr), `summary.txt` and
 * `summary.json`. Prints a table at the end and exits 1 if any job failed,
 * crashed or timed out, 2 if the stack is not up.
 *
 * ── Why this is fast, and why it is safe to be fast ─────────────────────────
 * Every job runs in its own process with its own Chromium, its own output
 * directory, and its OWN freshly registered accounts and businesses, built
 * seconds before it starts by `lib/fixtures.mjs` (or by the harness itself,
 * for the harnesses that always registered their own). No job reads another
 * job's state file, no job reuses an account from an earlier run, and nothing
 * depends on a long-lived book staying small — so jobs cannot interfere and
 * can run side by side.
 *
 * That spends registrations freely: ~70 per full run. The per-IP sign-up
 * budget is 20 an hour, so the API must be started with
 * `UB_E2E_RELAX_THROTTLES=1` (read by `config.settings.local` ONLY; see the
 * comment there). The preflight below refuses a full run against an API
 * process that does not carry it:
 *
 *   cd backend && UB_E2E_RELAX_THROTTLES=1 setsid nohup \
 *     python manage.py runserver 0.0.0.0:8000 --noreload > /tmp/claude-0/be-serve.log 2>&1 &
 *
 * Not run here: `look.mjs` (a screenshot tool, no assertions) and sprint3-qa
 * N4 (locks the per-IP login budget by design; run it alone, without the
 * relaxation, with `node e2e/sprint3-qa.mjs --only=N4`).
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fx from './lib/fixtures.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOTS_ROOT = process.env.E2E_SHOTS_ROOT ?? '/tmp/e2e-shots';
const DURATIONS_FILE = `${SHOTS_ROOT}/.regress-durations.json`;

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, short) => {
  const i = argv.findIndex((a) => a === `--${name}` || (short && a === `-${short}`));
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
};
const CONCURRENCY = Number(opt('concurrency', 'j') ?? process.env.E2E_CONCURRENCY ?? 6);
const JOB_TIMEOUT_MS = Number(opt('timeout') ?? 12 * 60) * 1000; // seconds on the CLI
const QUICK = flag('quick');
const ONLY = (opt('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SKIP = (opt('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ── The jobs ─────────────────────────────────────────────────────────────────
// `setup` runs inside the job's concurrency slot, just before the harness, and
// returns extra CLI args. `est` is a first-run guess in seconds; after a run
// the measured durations (DURATIONS_FILE) take over, and jobs start longest
// first so the slowest one never starts last.
// `joined`: the phase reads the book as phase C LEAVES it — the invitee has
// accepted and is an active staff member of the owner's business (A1's
// no-ledger-read role, R's "3 people · 1 invited", N1's two-business control).
// Historically that held only on a rerun after C; `--joined` seeds it.
const s3 = (phase, est, { rt = false, joined = false, quick = false } = {}) => ({
  id: `s3-${phase}`, group: 's3', script: 'sprint3-qa.mjs', est, quick,
  note: `sprint3-qa phase ${phase}: own owner + invitee + accountant${joined ? ' (invitee joined as staff)' : ''}, seeded by the harness into its own dir${rt ? ' + fresh retest pair R1/R2' : ''}`,
  setup: async (dir) => {
    const env = { E2E_SPRINT3_DIR: dir };
    if (rt) {
      const file = join(dir, 'rt-accounts.json');
      writeFileSync(file, JSON.stringify(await fx.seedRetestAccounts(), null, 2));
      env.E2E_RT_ACCOUNTS = file;
    }
    return { args: [`--only=${phase}`, ...(joined ? ['--joined'] : [])], env };
  },
});
const plain = (id, est, { quick = false, args = [], quickArgs } = {}) => ({
  id, group: 'core', script: `${id}.mjs`, est, quick, quickArgs,
  note: 'registers its own fresh accounts',
  setup: async () => ({ args }),
});
const d2 = (id, phase, est, make, extra = []) => ({
  id: `d2-${id}`, group: 'd2', script: 'defects2-qa.mjs', est,
  note: `defects2-qa --only=${phase}`,
  setup: async () => ({ args: [`--only=${phase}`, ...(await make()), ...extra] }),
});
const d3 = (phase, est, make, { quick = false } = {}) => ({
  id: `d3-${phase}`, group: 'd3', script: 'defects3-qa.mjs', est, quick,
  note: `defects3-qa --only=${phase}`,
  setup: async () => ({ args: [`--only=${phase}`, ...(await make())] }),
});

// Sprint 12 accessibility sweep (TSK-CHS-CI-21): axe-core + names, landmarks,
// 44 px hit areas, Devanagari clipping and three keyboard flows. Split by width
// so neither half nears the job timeout; the Hindi 360 pass rides with phone.
const a11y = (id, est, args, { quick = false } = {}) => ({
  id, group: 'a11y', script: 'a11y-sweep.mjs', est, quick,
  note: `a11y-sweep ${args.join(' ')}: seeds its own GST shop + an un-onboarded user`,
  setup: async () => ({ args }),
});

const JOBS = [
  a11y('a11y-phone', 480, ['--viewport=phone']),
  a11y('a11y-desktop', 360, ['--viewport=desktop', '--no-hi']),

  // Harnesses that always seeded themselves.
  plain('journey', 90, { quick: true, quickArgs: ['--viewport', 'laptop'] }),
  plain('parties', 60, { quick: true }),
  plain('credit', 120, { quick: true }),
  plain('tags', 120),
  plain('aging', 120, { quick: true }),
  plain('ledger', 240),
  plain('statement', 150, { quick: true }),
  plain('writeoff', 60, { quick: true }),
  // SAL-03 FR-5 — a shared bill opened the way a customer opens it (launch blocker).
  plain('share-page', 60, { quick: true }),
  plain('credentials', 60, { quick: true }),
  plain('security', 30, { quick: true }),

  // sprint3-qa, one job per phase so the long ones overlap.
  s3('A', 180, { joined: true }),
  s3('B', 240),
  s3('C', 90),
  s3('R', 240, { rt: true, joined: true }),
  s3('N3', 90),
  s3('N1', 120, { rt: true, joined: true }),
  s3('N2', 150, { quick: true }),
  s3('F1', 180),
  s3('F2', 150),
  s3('F3', 200, { rt: true }),

  // defects2-qa: each phase's precondition built fresh.
  d2('O-en', 'O', 90, async () => [`--user=${(await fx.newUser({ prefix: 'd2-o' })).email}`]),
  d2('O-hi', 'O', 90, async () => [`--user=${(await fx.newUser({ prefix: 'd2-ohi' })).email}`], ['--hi']),
  d2('T', 'T', 45, async () => [`--user=${(await fx.newUser({ prefix: 'd2-t' })).email}`]),
  d2('S', 'S', 90, async () => [`--user=${(await fx.newOwner({ prefix: 'd2-s' })).email}`]),
  d2('M', 'M', 60, async () => {
    const [owner, taken] = await Promise.all([fx.newOwner({ prefix: 'd2-m' }), fx.takenMobile()]);
    return [`--user=${owner.email}`, `--taken=${taken}`];
  }),
  d2('L', 'L', 150, async () => [`--user=${(await fx.newOwner({ prefix: 'd2-l' })).email}`]),
  {
    id: 'd2-sweep', group: 'd2', script: 'defects2-sweep.mjs', est: 150,
    note: 'defects2-sweep: owner with a "Ramesh L" party + owner whose 2nd business is unfinished',
    setup: async () => {
      const [owner, wiz] = await Promise.all([fx.sweepOwner(), fx.ownerWithUnfinished()]);
      return { args: [`--owner=${owner.email}`, `--wizard=${wiz.email}`, `--wizardShop=${wiz.unfinished.name}`] };
    },
  },

  // defects3-qa: each phase's precondition built fresh.
  d3('P', 120, async () => {
    const [owner, wiz] = await Promise.all([fx.newOwner({ prefix: 'd3-p' }), fx.ownerWithUnfinished({ step: 2 })]);
    return [`--owner=${owner.email}`, `--wizard=${wiz.email}`, `--wizardShop=${wiz.unfinished.name}`];
  }),
  d3('R4', 60, async () => [`--owner=${(await fx.ownerWithUnfinished({ withBooks: true })).email}`]),
  d3('R4HI', 60, async () => [`--owner=${(await fx.newOwner({ prefix: 'd3-r4hi' })).email}`]),
  d3('CORNER', 30, async () => {
    const staff = await fx.staffOfUnfinishedEmployer();
    return [`--user=${staff.email}`, `--password=${staff.password}`];
  }),
  d3('SW', 60, async () => [`--owner=${(await fx.ownerWithTwoBusinesses()).email}`], { quick: true }),
  d3('L7', 45, async () => [`--owner=${(await fx.ownerWithUnfinished()).email}`]),
  d3('L8', 30, async () => [`--owner=${(await fx.newOwner({ prefix: 'd3-l8' })).email}`]),
  d3('HI', 60, async () => {
    const [owner, taken] = await Promise.all([fx.newOwner({ prefix: 'd3-hi' }), fx.takenMobile()]);
    return [`--owner=${owner.email}`, `--taken=${taken}`];
  }),
];

const matches = (job, pattern) =>
  pattern === job.id || pattern === job.group || (pattern.endsWith('*') && job.id.startsWith(pattern.slice(0, -1)));
let selected = JOBS.filter((j) => (ONLY.length ? ONLY.some((p) => matches(j, p)) : QUICK ? j.quick : true));
selected = selected.filter((j) => !SKIP.some((p) => matches(j, p)));
if (ONLY.length && selected.length === 0) {
  console.error(`--only matched nothing. Jobs: ${JOBS.map((j) => j.id).join(', ')}`);
  process.exit(2);
}

// ── Longest first, by the last measured durations ────────────────────────────
const lastDurations = (() => { try { return JSON.parse(readFileSync(DURATIONS_FILE, 'utf8')); } catch { return {}; } })();
const weight = (j) => lastDurations[j.id] ?? j.est;
selected.sort((a, b) => weight(b) - weight(a));

if (flag('list')) {
  for (const j of selected) console.log(`${j.id.padEnd(12)} ~${String(Math.round(weight(j))).padStart(4)}s  ${j.script.padEnd(20)} ${j.note}`);
  console.log(`\n${selected.length} jobs, concurrency ${CONCURRENCY}`);
  process.exit(0);
}

// ── Preflight ────────────────────────────────────────────────────────────────
const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`; };
/**
 * The process serving `port`, with its stdout log and environment, read from
 * /proc. Other worktrees run their own servers on other ports on the same box,
 * so a process is ours only if it names our port — on its command line
 * (`runserver 0.0.0.0:8000`) or in its environment (`PORT=3000`).
 */
function servedProcess(match, port) {
  try {
    for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
      let cmd = '';
      try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { continue; }
      if (!match.test(cmd) || /bash -c/.test(cmd)) continue;
      let log = null; let env = null;
      try { log = readlinkSync(`/proc/${pid}/fd/1`); } catch { /* not ours to read */ }
      try { env = Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)])); } catch { /* idem */ }
      if (!new RegExp(`:${port}\\b`).test(cmd) && env?.PORT !== String(port)) continue;
      return { pid, log: log && log.startsWith('/') ? log : null, env };
    }
  } catch { /* no /proc */ }
  return null;
}
async function status(url) {
  try { return (await fetch(url, { redirect: 'manual' })).status; } catch { return 0; }
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const RUN_DIR = opt('out') ?? `${SHOTS_ROOT}/regress-${stamp}`;
mkdirSync(RUN_DIR, { recursive: true });

const [fe, be] = await Promise.all([status(`${FRONTEND}/login`), status(`${BACKEND}/system/health`)]);
if (fe !== 200 || be !== 200) {
  console.error(`stack not up: frontend /login → ${fe}, api /system/health → ${be}`);
  process.exit(2);
}
const api = servedProcess(/manage\.py runserver/, new URL(BACKEND).port || 80);
const web = servedProcess(/next-server|standalone\/server\.js|node server\.js/, new URL(FRONTEND).port || 80);
const relax = api?.env ? api.env.UB_E2E_RELAX_THROTTLES : undefined;
if (api?.env && !['1', 'true', 'yes', 'on'].includes(String(relax).toLowerCase())) {
  const msg = `the API process (pid ${api.pid}) was started without UB_E2E_RELAX_THROTTLES=1; `
    + `${selected.length} jobs register ~${selected.length * 2} accounts against a budget of 20 per IP per hour.`;
  if (!flag('allow-throttled') && selected.length > 5) {
    console.error(`${msg}\nRestart it with the variable (see the header of this file), or pass --allow-throttled.`);
    process.exit(2);
  }
  console.warn(`WARNING: ${msg}`);
}
const childEnvBase = {
  ...process.env,
  E2E_FRONTEND: FRONTEND,
  E2E_BACKEND: BACKEND,
  ...(api?.log ? { E2E_BE_LOG: api.log } : {}),
  ...(web?.log ? { E2E_FE_LOG: web.log } : {}),
};

// ── Run ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const clock = () => fmt(Date.now() - t0).padStart(6);
console.log(`regression: ${selected.length} jobs, concurrency ${CONCURRENCY}${QUICK ? ' (quick)' : ''} → ${RUN_DIR}`);
console.log(`api pid ${api?.pid ?? '?'} relax=${relax ?? '?'} log=${api?.log ?? '?'} · web log=${web?.log ?? '?'}\n`);

/** "12/14 checks passed" or "12/14 passed" — the LAST such line is the harness total. */
function parseCounts(text) {
  const all = [...text.matchAll(/^\s*(\d+)\/(\d+) (?:checks )?passed/gm)];
  if (all.length) { const m = all[all.length - 1]; return { passed: Number(m[1]), total: Number(m[2]) }; }
  const ok = (text.match(/^(ok|PASS)\b/gm) ?? []).length;
  const bad = (text.match(/^\s*FAIL\b/gm) ?? []).length;
  return ok + bad ? { passed: ok, total: ok + bad, inferred: true } : null;
}
const failLines = (text) =>
  [...new Set(text.split('\n').filter((l) => /^\s*FAIL\b/.test(l)).map((l) => l.trim().replace(/\s+/g, ' ')))].slice(0, 8);

// Each harness runs in its own process group (so a timeout can take down its
// Chromium too); if the runner itself is interrupted, it takes them all down.
const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    for (const pid of children) { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } }
    process.exit(130);
  });
}

/** One harness process; resolves with its exit code and everything it printed. */
function spawnStep(script, args, env, log, deadline) {
  return new Promise((resolve) => {
    log.write(`$ node ${script} ${args.join(' ')}\n`);
    const child = spawn(process.execPath, [join(E2E_DIR, script), ...args], { cwd: E2E_DIR, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child.pid);
    let out = '';
    const onData = (b) => { out += b; log.write(b); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, Math.max(1000, deadline - Date.now()));
    child.on('close', (code) => {
      clearTimeout(timer);
      children.delete(child.pid);
      // Take down anything the harness left behind (an orphaned Chromium).
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      log.write(`# exit ${code}${timedOut ? ' (timeout)' : ''}\n\n`);
      resolve({ code, out, timedOut });
    });
  });
}

/** PASS: exit 0, every check passed. FAIL: a check failed. CRASH: it died without a failing check. */
function judge({ code, out, timedOut }) {
  const counts = parseCounts(out);
  let st;
  if (timedOut) st = 'TIMEOUT';
  else if (code === 0 && counts && counts.passed === counts.total) st = 'PASS';
  else if (counts && counts.passed < counts.total) st = 'FAIL';
  else st = 'CRASH';
  const fails = failLines(out);
  if (st === 'CRASH' || st === 'TIMEOUT') fails.push(...out.trim().split('\n').filter((l) => l.trim()).slice(-4).map((l) => l.trim().slice(0, 200)));
  return { st, passed: counts?.passed ?? 0, total: counts?.total ?? 0, fails };
}

async function runJob(job, attempt = 1) {
  const name = attempt > 1 ? `${job.id}.retry` : job.id;
  const dir = join(RUN_DIR, name);
  mkdirSync(dir, { recursive: true });
  const logPath = join(RUN_DIR, `${name}.log`);
  const log = createWriteStream(logPath);
  const started = Date.now();
  const deadline = started + JOB_TIMEOUT_MS;
  const finish = (r) => {
    const ms = Date.now() - started;
    log.end(`# ${r.status} · ${fmt(ms)} (fixtures ${fmt(r.setupMs ?? 0)})\n`);
    console.log(`${clock()}  ${r.status.padEnd(7)} ${name.padEnd(12)} ${String(r.passed).padStart(3)}/${String(r.total).padEnd(3)} ${fmt(ms)}`);
    return { id: job.id, log: logPath, ms, ...r };
  };
  log.write(`# ${job.id} — ${job.note}\n\n`);
  let setup;
  try {
    setup = await job.setup(dir);
  } catch (e) {
    log.write(`fixture setup failed: ${e.stack ?? e}\n`);
    return finish({ status: 'SETUP', passed: 0, total: 0, setupMs: Date.now() - started, fails: [String(e.message ?? e).slice(0, 300)] });
  }
  const setupMs = Date.now() - started;
  const env = { ...childEnvBase, E2E_SHOTS: dir, E2E_SHOTS_DIR: dir, ...(setup.env ?? {}) };
  const args = [...(QUICK && job.quickArgs ? job.quickArgs : []), ...(setup.args ?? [])];
  const v = judge(await spawnStep(job.script, args, env, log, deadline));
  return finish({ status: v.st, passed: v.passed, total: v.total, setupMs, fails: v.fails });
}

// A job that CRASHES or TIMES OUT (the harness died before judging anything —
// on a 2-core box that is almost always a 20 s wait lost to CPU contention) is
// re-run once, with fresh fixtures, and reported as retried. A job whose check
// FAILED is never retried: a failed assertion is a finding, not noise.
const RETRY = !flag('no-retry');
const queue = selected.map((job) => ({ job, attempt: 1 }));
const results = [];
const running = new Set();
// Starts are spaced by START_GAP_MS: six Chromiums launching and six fixture
// sets hashing passwords in the same second is the one moment a 2-core box is
// saturated, and it is when the harnesses' first sign-in waits run out.
const START_GAP_MS = Number(opt('start-gap') ?? 2500);
// …and a job starts only if the box has room for it. This machine is shared
// with other worktrees' builds, and a harness plus its Chromium needs about
// 400 MB; starting one into a box with less than that free is how a run turns
// into a column of CRASHes. Two jobs always run, whatever the gauge says.
const MIN_FREE_MB = Number(opt('min-free-mb') ?? 600);
const memAvailableMb = () => {
  try { return Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024; } catch { return Infinity; }
};
let gatedSince = 0;
let lastStart = 0;
let pumpTimer = null;
await new Promise((resolveAll) => {
  const pump = () => {
    while (running.size < CONCURRENCY && queue.length) {
      let wait = lastStart + START_GAP_MS - Date.now();
      if (wait <= 0 && running.size >= 2 && memAvailableMb() < MIN_FREE_MB) {
        if (!gatedSince) { gatedSince = Date.now(); console.log(`${clock()}  (holding: ${Math.round(memAvailableMb())} MB free, ${running.size} running)`); }
        wait = 2000;
      } else if (wait <= 0 && gatedSince) {
        gatedSince = 0;
      }
      if (wait > 0) { if (!pumpTimer) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, wait); return; }
      lastStart = Date.now();
      const { job, attempt } = queue.shift();
      const p = runJob(job, attempt).then((r) => {
        running.delete(p);
        if (RETRY && attempt === 1 && (r.status === 'CRASH' || r.status === 'TIMEOUT')) {
          queue.unshift({ job, attempt: 2 }); // straight away, not behind the queue
          results.push({ ...r, superseded: true });
        } else {
          const first = results.find((x) => x.id === job.id && x.superseded);
          results.push(first ? { ...r, retriedAfter: first.status, firstLog: first.log } : r);
        }
        pump();
      });
      running.add(p);
    }
    if (!running.size && !queue.length) resolveAll();
  };
  pump();
});
const superseded = results.filter((r) => r.superseded);
results.splice(0, results.length, ...results.filter((r) => !r.superseded));
const wall = Date.now() - t0;

// ── Report ───────────────────────────────────────────────────────────────────
const order = new Map(JOBS.map((j, i) => [j.id, i]));
results.sort((a, b) => order.get(a.id) - order.get(b.id));
const totals = results.reduce((acc, r) => ({ passed: acc.passed + r.passed, total: acc.total + r.total }), { passed: 0, total: 0 });
const bad = results.filter((r) => r.status !== 'PASS');
const cpuSum = [...results, ...superseded].reduce((a, r) => a + r.ms, 0);
const lines = [];
lines.push(`${'job'.padEnd(12)} ${'status'.padEnd(7)} ${'checks'.padStart(9)}  ${'time'.padStart(6)}`);
lines.push('-'.repeat(40));
for (const r of results) lines.push(`${r.id.padEnd(12)} ${(r.status + (r.retriedAfter ? '*' : '')).padEnd(7)} ${`${r.passed}/${r.total}`.padStart(9)}  ${fmt(r.ms).padStart(6)}${r.retriedAfter ? `  (retried after ${r.retriedAfter})` : ''}`);
lines.push('-'.repeat(40));
lines.push(`${'TOTAL'.padEnd(12)} ${(bad.length ? 'FAIL' : 'PASS').padEnd(7)} ${`${totals.passed}/${totals.total}`.padStart(9)}  ${fmt(wall).padStart(6)} wall · ${fmt(cpuSum)} summed job time · ${results.length} jobs · -j ${CONCURRENCY}`);
if (superseded.length) {
  lines.push('', `* re-run once after the first attempt died without judging (flaky under load, worth a look):`);
  for (const r of superseded) lines.push(`  ${r.id} ${r.status} — ${r.log}${r.fails[0] ? ` — ${r.fails.filter((f) => !/^\s*at /.test(f))[0] ?? ''}` : ''}`);
}
if (bad.length) {
  lines.push('', 'Failures:');
  for (const r of bad) {
    lines.push(`  ${r.id} (${r.status}) — ${r.log}`);
    for (const f of r.fails) lines.push(`      ${f.slice(0, 220)}`);
  }
}
lines.push('', `logs and screenshots: ${RUN_DIR}`);
const report = lines.join('\n');
console.log(`\n${report}`);
writeFileSync(join(RUN_DIR, 'summary.txt'), `${report}\n`);
writeFileSync(join(RUN_DIR, 'summary.json'), JSON.stringify({ stamp, wallMs: wall, concurrency: CONCURRENCY, quick: QUICK, totals, results, retried: superseded }, null, 2));
try {
  const merged = { ...lastDurations };
  for (const r of results) if (r.status === 'PASS' || r.status === 'FAIL') merged[r.id] = Math.round(r.ms / 1000);
  writeFileSync(DURATIONS_FILE, JSON.stringify(merged, null, 2));
} catch { /* ordering is an optimisation only */ }
process.exit(bad.length ? 1 : 0);
