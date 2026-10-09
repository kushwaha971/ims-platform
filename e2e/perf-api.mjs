/**
 * perf-api.mjs — API response times on a launch-scale book, measured live.
 *
 * Seed the book first (bulk, invariant-preserving, refused in production):
 *   python manage.py seed_scale --check --email perf-<n>@e2e.test
 * then:
 *   node e2e/perf-api.mjs --email perf-<n>@e2e.test [--password …] [--runs 30]
 *
 * For each screen's main request it records p50 / p95 / max over `--runs`
 * sequential calls after one warm-up, then fires a burst of `--burst`
 * concurrent list requests to see how the API behaves under a counter-rush.
 * The targets are the NFRs the FRDs state (Part 12 §12.8): a list page or a
 * khata under 500 ms at p95 on the seeded book. It prints a table and exits 1
 * when a target is missed. Numbers are this machine's — a laptop running the
 * Django dev server, not production hardware — and are reported as such.
 */
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const arg = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const EMAIL = arg('--email');
const PASSWORD = arg('--password', 'Scale-Run-2026!');
const RUNS = Number(arg('--runs', 30));
const BURST = Number(arg('--burst', 20));
const P95_TARGET_MS = Number(arg('--p95', 500));
if (!EMAIL) throw new Error('--email is required (the seed_scale owner)');

const call = async (path, token) => {
  const t0 = performance.now();
  const r = await fetch(`${BACKEND}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Client': 'api' },
  });
  const body = await r.text();
  return { ms: performance.now() - t0, status: r.status, body };
};
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const login = await fetch(`${BACKEND}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Client': 'api' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
const token = login?.data?.access_token;
if (!token) throw new Error(`sign-in failed: ${JSON.stringify(login).slice(0, 200)}`);

// The heaviest khata: the party with the most entries is first by balance size
// in seed_scale; ask the list for one party and its id.
const parties = JSON.parse((await call('/parties?page_size=50&ordering=-balance', token)).body);
const heavy = parties?.data?.[0]?.id;
const year = new Date().getFullYear();

const ENDPOINTS = [
  ['party list (page 1)', '/parties?page_size=50'],
  ['party search', '/parties?page_size=50&q=ra'],
  ['party list filtered', '/parties?page_size=50&balance=owes_me'],
  ['khata entries', `/parties/${heavy}/ledger-entries?limit=50`],
  ['statement (this FY)', `/parties/${heavy}/statement?from=${year}-04-01`],
  ['dashboard', '/reports/dashboard'],
  ['invoices list', '/sales/invoices?page_size=50'],
  ['items list', '/items?page_size=50'],
  ['payments list', '/payments?page_size=50'],
  ['receivables aging', '/reports/receivables-aging'],
  ['day book (today)', '/reports/day-book'],
];

const rows = [];
let missed = 0;
for (const [name, path] of ENDPOINTS) {
  const warm = await call(path, token);
  const times = [];
  for (let i = 0; i < RUNS; i += 1) times.push((await call(path, token)).ms);
  const p95 = pct(times, 95);
  const ok = warm.status === 200 && p95 <= P95_TARGET_MS;
  if (!ok) missed += 1;
  rows.push({ name, status: warm.status, p50: pct(times, 50), p95, max: Math.max(...times), bytes: warm.body.length, ok });
}

const burstStart = performance.now();
const burst = await Promise.all(
  Array.from({ length: BURST }, () => call('/parties?page_size=50', token))
);
const burstWall = performance.now() - burstStart;
const burstTimes = burst.map((b) => b.ms);
const burstErrors = burst.filter((b) => b.status !== 200).length;

const f = (n) => `${Math.round(n)}`.padStart(6);
console.log(`\nAPI timings — ${RUNS} sequential calls each after a warm-up, ${BACKEND}`);
console.log(`${'endpoint'.padEnd(24)} status   p50    p95    max   KB`);
for (const r of rows) {
  console.log(`${r.name.padEnd(24)} ${String(r.status).padEnd(6)} ${f(r.p50)} ${f(r.p95)} ${f(r.max)} ${(r.bytes / 1024).toFixed(1).padStart(5)} ${r.ok ? '' : '  ✗ over target'}`);
}
console.log(`\nburst: ${BURST} concurrent party-list requests — wall ${Math.round(burstWall)} ms, p50 ${Math.round(pct(burstTimes, 50))} ms, p95 ${Math.round(pct(burstTimes, 95))} ms, non-200: ${burstErrors}`);
console.log(`target: p95 ≤ ${P95_TARGET_MS} ms per endpoint — ${missed ? `${missed} missed` : 'all met'}`);
process.exit(missed || burstErrors ? 1 : 0);
