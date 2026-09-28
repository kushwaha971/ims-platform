#!/usr/bin/env node
/**
 * e2e/aging.mjs — LED-09's aging report, against a real browser and a real
 * server, plus the screenshot sweep that goes with it.
 *
 * ── What only a live stack can answer ──────────────────────────────────────
 *
 *   1. **FIFO, to the paisa, over a real book.** The arithmetic is a five-stage
 *      CTE (`ledger/selectors/aging.py`) and the unit suite proves it against
 *      fixtures. Here it is proved against a book seeded through the same API a
 *      merchant uses — backdated entries, an opening balance, a reversed pair,
 *      a payment that must eat the OLDEST debit first — and compared with
 *      figures worked out by hand below, and with an independent loop-based
 *      FIFO model for the dates the hand table does not cover.
 *   2. **The as-of reaches the WIRE.** `parties.mjs` exists because a set of
 *      chips lit up while the service sent nothing. The as-of date picker, the
 *      Payable tab and the tag filter are all asserted by the request they
 *      cause, not by the control's state.
 *   3. **Every figure on the screen is the figure the server sent.** The four
 *      tiles, the rows and their order are read off the rendered page.
 *   4. **The drill-down lands on the statement as of the report's date** — the
 *      URL's `to` and the statement request's `date_to` both carry it.
 *   5. **The export is a file, it is audited, and it is budgeted.** The audit
 *      row is read from the DATABASE through `manage.py shell`, because there is
 *      no audit-log API yet (`/audit-logs` lands with PLT-11). The 11th export
 *      in an hour answers 429 while the report itself still reads.
 *   6. **Nothing runs off the screen** at 360/768/1280/1440, measured as
 *      `scrollWidth` against the viewport on every tab this sweep visits.
 *
 * One account per run (`register_ip` is a DB-backed budget of ~20 a window),
 * and one browser sign-in: the four widths are the same context resized.
 *
 *   ./e2e/serve-api.sh && ./e2e/serve.sh
 *   node e2e/aging.mjs
 *   node e2e/aging.mjs --shots     # + $E2E_SHOTS/aging/<size>/*.png
 *
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? '/home/claude/repo/backend';
const SHOT_DIR = `${process.env.E2E_SHOTS ?? '/tmp/e2e-shots'}/aging`;
const EXPORT_LIMIT = Number(process.env.E2E_EXPORT_LIMIT ?? 10); // UB_RATE_LIMIT_EXPORT, 10/hour
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check}${detail ? `\n        ${detail}` : ''}`);
};

const stamp = Date.now();
const OWNER = { email: `aging-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
];

const BUCKETS = ['0_30', '31_60', '61_90', '90_plus'];
const BUCKET_LABELS = { '0_30': '0–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90_plus': '90+ days' };

// ── HTTP ────────────────────────────────────────────────────────────────────

const api = async (method, path, body, token, extra = {}) => {
  const response = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'api',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);
  return { status: response.status, body: payload, headers: response.headers };
};
const must = async (...args) => {
  const response = await api(...args);
  if (response.status >= 400) {
    throw new Error(`${args[0]} ${args[1]} ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
};

// ── Money and dates ─────────────────────────────────────────────────────────

/** "1234.56" → 123456 paise. Integer arithmetic, so "to the paisa" means it. */
const paise = (value) => {
  const [whole, frac = ''] = String(value).split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
};
const rupees = (p) => `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`;
/** The product's `formatInr`: ₹ and Indian grouping (₹1,23,456.78). */
const inr = (value) => {
  const [whole, frac] = rupees(paise(value)).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `₹${grouped}.${frac}`;
};
const shift = (iso, days) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const ageDays = (asOf, iso) => Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);

// ── The book ────────────────────────────────────────────────────────────────

/**
 * Every party, and every entry that SHOULD count, as days-before-today.
 * `reversed` entries are posted and then reversed; the model leaves them out,
 * because a reversed pair nets to nothing and aging excludes both halves.
 */
const BOOK = {
  A: { name: 'Arora General', entries: [['debit', '3000.00', 10]], reversed: [['debit', '999.00', 12]] },
  B: { name: 'Bhatia Kirana', entries: [['debit', '500.00', 5], ['debit', '2000.00', 45]] },
  // Lower-case on purpose: the name sort must fold case, and this party ties
  // Bhatia on 90+ (₹0) AND on total (₹2,500) — the tie the id has to break.
  F: { name: 'bansal Hardware', entries: [['debit', '2500.00', 2]] },
  // FIFO: the ₹400 paid three days ago eats the OLDEST debit, leaving ₹600 at 90+.
  C: { name: 'Chawla Traders', entries: [['debit', '1000.00', 100], ['credit', '400.00', 3]] },
  // The supplier: an opening balance the merchant owes, via PTY-01's fields.
  D: { name: 'Dhillon Suppliers', supplier: true, opening: ['2000.00', 'credit', 20], entries: [] },
  E: { name: 'Eknath Stores', tags: ['Route 2'], entries: [['debit', '1234.56', 70]] },
  // The bucket EDGES: 30 is still 0–30, 31 is 31–60, 90 is 61–90, 91 is 90+.
  G: {
    name: 'Gupta Dairy',
    entries: [['debit', '100.10', 30], ['debit', '200.20', 31], ['debit', '300.30', 90], ['debit', '400.40', 91]],
  },
};

/**
 * Worked out by hand, as of the tenant's today. Written out rather than derived,
 * so that a model and a server that agree on a wrong answer still fail here.
 */
const HAND_RECEIVABLE = {
  A: { '0_30': '3000.00', '31_60': '0.00', '61_90': '0.00', '90_plus': '0.00', total: '3000.00' },
  B: { '0_30': '500.00', '31_60': '2000.00', '61_90': '0.00', '90_plus': '0.00', total: '2500.00' },
  F: { '0_30': '2500.00', '31_60': '0.00', '61_90': '0.00', '90_plus': '0.00', total: '2500.00' },
  C: { '0_30': '0.00', '31_60': '0.00', '61_90': '0.00', '90_plus': '600.00', total: '600.00' },
  E: { '0_30': '0.00', '31_60': '0.00', '61_90': '1234.56', '90_plus': '0.00', total: '1234.56' },
  G: { '0_30': '100.10', '31_60': '200.20', '61_90': '300.30', '90_plus': '400.40', total: '1001.00' },
};
const HAND_RECEIVABLE_TOTALS = { '0_30': '6100.10', '31_60': '2200.20', '61_90': '1534.86', '90_plus': '1000.40', total: '10835.56' };
const HAND_PAYABLE = { D: { '0_30': '2000.00', '31_60': '0.00', '61_90': '0.00', '90_plus': '0.00', total: '2000.00' } };

/**
 * An independent FIFO: a loop over debits oldest-first, spending the credits,
 * in integer paise. Deliberately NOT the SQL's cumulative-window formulation,
 * so the two can only agree by both being right.
 */
function modelAging(today, asOf, kind) {
  const [owedSide, paidSide] = kind === 'payable' ? ['credit', 'debit'] : ['debit', 'credit'];
  const out = {};
  for (const [key, party] of Object.entries(BOOK)) {
    const lines = [...party.entries];
    if (party.opening) lines.push([party.opening[1], party.opening[0], party.opening[2]]);
    const dated = lines
      .map(([direction, amount, back]) => ({ direction, amount: paise(amount), date: shift(today, back) }))
      .filter((line) => line.date <= asOf);
    let credit = dated.filter((l) => l.direction === paidSide).reduce((s, l) => s + l.amount, 0);
    const owed = dated.filter((l) => l.direction === owedSide).sort((a, b) => a.date.localeCompare(b.date));
    const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
    for (const line of owed) {
      const applied = Math.min(credit, line.amount);
      credit -= applied;
      const open = line.amount - applied;
      const age = ageDays(asOf, line.date);
      buckets[age <= 30 ? '0_30' : age <= 60 ? '31_60' : age <= 90 ? '61_90' : '90_plus'] += open;
    }
    const total = BUCKETS.reduce((s, b) => s + buckets[b], 0);
    if (total > 0) out[key] = { ...Object.fromEntries(BUCKETS.map((b) => [b, rupees(buckets[b])])), total: rupees(total) };
  }
  return out;
}
const sumRows = (rows) => {
  const totals = {};
  for (const field of [...BUCKETS, 'total']) {
    totals[field] = rupees(Object.values(rows).reduce((s, row) => s + paise(row[field]), 0));
  }
  return totals;
};
const sameFigures = (a, b) => [...BUCKETS, 'total'].every((f) => a && b && paise(a[f]) === paise(b[f]));
const show = (row) => (row ? [...BUCKETS, 'total'].map((f) => `${f}=${row[f]}`).join(' ') : 'absent');

// ── Seeding ─────────────────────────────────────────────────────────────────

async function seed() {
  const registered = await must('POST', '/auth/register', {
    email: OWNER.email,
    password: OWNER.password,
    full_name: OWNER.name,
  });
  await must('POST', '/tenants', { name: 'Kumar Stores', business_type: 'retail', state_code: '27' },
    registered.body.data.access_token, { 'Idempotency-Key': `tenant-${stamp}` });
  // A second sign-in: the register token was minted before the tenant existed.
  const token = (await must('POST', '/auth/login', { email: OWNER.email, password: OWNER.password }))
    .body.data.access_token;

  // The TENANT's today, from the server — not this machine's clock, which is
  // UTC and a day behind an Indian evening.
  const empty = await must('GET', '/ledger/aging', null, token);
  const today = empty.body.meta.as_of;

  const ids = {};
  let n = 0;
  for (const [key, party] of Object.entries(BOOK)) {
    const made = await must('POST', '/parties', {
      name: party.name,
      is_customer: !party.supplier,
      is_supplier: Boolean(party.supplier),
      mobile: null,
      ...(party.tags ? { tags: party.tags } : {}),
      ...(party.opening
        ? {
            opening_balance_amount: party.opening[0],
            opening_balance_direction: party.opening[1],
            opening_balance_as_of: shift(today, party.opening[2]),
          }
        : {}),
    }, token, { 'Idempotency-Key': `aging-party-${stamp}-${key}` });
    ids[key] = made.body.data.id;
    const post = (direction, amount, back) =>
      must('POST', `/parties/${ids[key]}/ledger-entries`, {
        direction,
        amount,
        entry_date: shift(today, back),
        ...(direction === 'credit' ? { payment_mode: 'cash' } : {}),
      }, token, { 'Idempotency-Key': `aging-entry-${stamp}-${(n += 1)}` });
    for (const [direction, amount, back] of party.entries) await post(direction, amount, back);
    for (const [direction, amount, back] of party.reversed ?? []) {
      const entry = (await post(direction, amount, back)).body.data;
      const entryId = entry.id ?? entry.entry?.id;
      await must('POST', `/ledger-entries/${entryId}/reverse`, { reason: 'Typed it twice' }, token,
        { 'Idempotency-Key': `aging-reverse-${stamp}-${(n += 1)}` });
    }
  }
  return { token, today, ids };
}

// ── Browser helpers ─────────────────────────────────────────────────────────

const signIn = async (page) => {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', OWNER.email);
  await page.fill('input[type="password"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
  await page.waitForTimeout(1500);
};

const isAgingRead = (request) => {
  const url = new URL(request.url());
  return `${url.origin}${url.pathname}` === `${BACKEND}/ledger/aging` && url.searchParams.get('format') !== 'csv';
};
const paramsOf = (request) => Object.fromEntries(new URL(request.url()).searchParams);

/** Load the aging page with `query`, returning the aging request it made and its JSON. */
async function openAging(page, query = '') {
  const request = page.waitForRequest(isAgingRead, { timeout: 90000 });
  const response = page.waitForResponse((r) => isAgingRead(r.request()), { timeout: 90000 });
  await page.goto(`${FRONTEND}/ledger/aging${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const sent = await request;
  const answer = await response;
  const body = await answer.json().catch(() => null);
  await page.getByTestId('aging-screen').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  return { params: paramsOf(sent), status: answer.status(), body };
}

/** The four tiles, read off the page: label → the ₹ figure on the same card. */
const readTiles = (page) =>
  page.evaluate((labels) => {
    const out = {};
    for (const [bucket, label] of Object.entries(labels)) {
      const el = [...document.querySelectorAll('[data-testid="aging-screen"] span')].find(
        (s) => s.textContent.trim() === label && !s.closest('table, th, [data-testid="ub-grid-card"]')
      );
      let node = el;
      while (node && !/₹/.test(node.textContent)) node = node.parentElement;
      out[bucket] = node ? (node.textContent.match(/₹[\d,]+\.\d{2}/) ?? [null])[0] : null;
    }
    return out;
  }, BUCKET_LABELS);

const expectedTiles = (totals) => Object.fromEntries(BUCKETS.map((b) => [b, inr(totals[b])]));
const tilesMatch = (tiles, totals) => BUCKETS.every((b) => tiles[b] === inr(totals[b]));

/** Poll the tiles until they show `totals` or the time runs out; returns what was last read. */
async function tilesSettle(page, totals, ms = 15000) {
  const until = Date.now() + ms;
  let tiles = await readTiles(page);
  while (!tilesMatch(tiles, totals) && Date.now() < until) {
    await page.waitForTimeout(300);
    tiles = await readTiles(page);
  }
  return tiles;
}

/** Party names in the order the grid renders them (table rows or phone cards). */
const gridNames = (page, names) =>
  page.evaluate((all) => {
    const text = document.querySelector('[data-testid="aging-screen"]')?.innerText ?? '';
    // Positions after the tiles, so a name can only be counted from the grid.
    return all
      .map((name) => ({ name, at: text.indexOf(`\n${name}`) >= 0 ? text.indexOf(`\n${name}`) : text.indexOf(name) }))
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((hit) => hit.name);
  }, names);

const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * Pick a date in the header's "As of" calendar, paging back a month if needed.
 * Retried, because a popover opened while the screen re-renders can close
 * under the click; the day button being clickable is the thing waited for.
 */
async function pickAsOf(page, iso) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const dialog = page.getByRole('dialog', { name: 'As of' });
      if (!(await dialog.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'As of', exact: true }).click();
      }
      await dialog.locator('td[data-day]').first().waitFor({ timeout: 10000 });
      const day = dialog.locator(`td[data-day="${iso}"] button`);
      if ((await day.count()) === 0) await dialog.getByRole('button', { name: /Previous Month/ }).click();
      await day.click({ timeout: 5000 });
      return;
    } catch (error) {
      lastError = error;
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  const dialogs = await page.getByRole('dialog').evaluateAll((ds) =>
    ds.map((d) => `${d.getAttribute('aria-label')}: ${d.querySelectorAll('td[data-day]').length} days`));
  throw new Error(`could not pick ${iso} in "As of" (${dialogs.join('; ') || 'no dialog'}): ${lastError?.message}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const main = async () => {
  const { token, today, ids } = await seed();
  const nameOf = Object.fromEntries(Object.entries(BOOK).map(([k, p]) => [k, p.name]));
  const keyOf = Object.fromEntries(Object.entries(ids).map(([k, id]) => [id, k]));
  const allNames = Object.values(nameOf);
  let exportsSpent = 0;

  // The harness checks itself before it checks anything else: the model must
  // reproduce the hand table, or every "model" expectation below is suspect.
  const selfTest = modelAging(today, today, 'receivable');
  if (!Object.keys(HAND_RECEIVABLE).every((k) => sameFigures(selfTest[k], HAND_RECEIVABLE[k])) ||
      Object.keys(selfTest).length !== Object.keys(HAND_RECEIVABLE).length ||
      !sameFigures(sumRows(HAND_RECEIVABLE), HAND_RECEIVABLE_TOTALS) ||
      !sameFigures(modelAging(today, today, 'payable').D, HAND_PAYABLE.D)) {
    throw new Error(`harness: the FIFO model disagrees with the hand table ${JSON.stringify(selfTest)}`);
  }

  const byKey = (rows) => Object.fromEntries((rows ?? []).map((row) => [keyOf[row.party.id] ?? row.party.name, row]));
  const compare = (label, response, expectedRows, expectedTotals) => {
    const got = byKey(response.body?.data);
    const keys = Object.keys(expectedRows);
    const extra = Object.keys(got).filter((k) => !(k in expectedRows));
    const wrong = keys.filter((k) => !sameFigures(got[k], expectedRows[k]));
    record(`${label}: every row matches to the paisa`,
      response.status === 200 && wrong.length === 0 && extra.length === 0,
      wrong.length || extra.length
        ? [...wrong.map((k) => `${nameOf[k]}: got ${show(got[k])} want ${show(expectedRows[k])}`), ...extra.map((k) => `unexpected ${k}`)].join(' | ')
        : `${keys.length} parties`);
    record(`${label}: the totals row matches to the paisa`,
      sameFigures(response.body?.meta?.totals, expectedTotals),
      `got ${show(response.body?.meta?.totals)} want ${show(expectedTotals)}`);
  };

  // ── 1. The arithmetic ────────────────────────────────────────────────────
  const receivable = await api('GET', '/ledger/aging?page_size=200', null, token);
  compare('receivable, today (hand-computed FIFO)', receivable, HAND_RECEIVABLE, HAND_RECEIVABLE_TOTALS);
  record('meta says what was asked: receivable, as of the tenant today, computed now',
    receivable.body?.meta?.type === 'receivable' && receivable.body?.meta?.as_of === today &&
      receivable.body?.meta?.cached_at === null && receivable.body?.meta?.total === 6,
    JSON.stringify({ ...receivable.body?.meta, totals: undefined }));
  const chawla = byKey(receivable.body?.data).C;
  record('FIFO: the ₹400 payment ate the OLDEST debit — Chawla has ₹600 at 90+ and nothing younger',
    chawla?.['90_plus'] === '600.00' && chawla?.['0_30'] === '0.00', show(chawla));
  record('a reversed pair counts for nothing (Arora is ₹3,000, not ₹3,999 or ₹2,001)',
    byKey(receivable.body?.data).A?.total === '3000.00', show(byKey(receivable.body?.data).A));

  const payable = await api('GET', '/ledger/aging?type=payable', null, token);
  compare('payable, today', payable, HAND_PAYABLE, HAND_PAYABLE.D);
  record('the payable side is the supplier and only the supplier',
    (payable.body?.data ?? []).map((r) => r.party.name).join() === nameOf.D,
    (payable.body?.data ?? []).map((r) => r.party.name).join() || 'empty');

  const summary = await api('GET', '/ledger/summary', null, token);
  record('the summary (cached balances) agrees with the FIFO walk as of today',
    summary.body?.data?.receivable === HAND_RECEIVABLE_TOTALS.total && summary.body?.data?.payable === HAND_PAYABLE.D.total,
    JSON.stringify(summary.body?.data));

  const pastAsOf = shift(today, 30);
  const past = await api('GET', `/ledger/aging?as_of=${pastAsOf}&page_size=200`, null, token);
  const pastModel = modelAging(today, pastAsOf, 'receivable');
  compare(`receivable as of ${pastAsOf} (30 days back, model)`, past, pastModel, sumRows(pastModel));
  record('a past as-of leaves out everybody whose money came later (Arora, bansal)',
    !byKey(past.body?.data).A && !byKey(past.body?.data).F && past.body?.meta?.as_of === pastAsOf,
    (past.body?.data ?? []).map((r) => r.party.name).join(', '));
  const pastPayable = await api('GET', `/ledger/aging?type=payable&as_of=${pastAsOf}`, null, token);
  record('and before the supplier\'s opening date the payable side is empty',
    pastPayable.status === 200 && (pastPayable.body?.data ?? []).length === 0 && pastPayable.body?.meta?.totals?.total === '0.00',
    JSON.stringify(pastPayable.body?.data));

  const future = await api('GET', `/ledger/aging?as_of=${shift(today, -1)}`, null, token);
  record('an as-of in the future is refused with a 400, not answered', future.status === 400,
    `status ${future.status} ${JSON.stringify(future.body?.error?.details ?? '')}`);

  // ── 2. The tag filter ────────────────────────────────────────────────────
  const tagged = await api('GET', `/ledger/aging?tag=${encodeURIComponent('Route 2')}`, null, token);
  compare('tag=Route 2', tagged, { E: HAND_RECEIVABLE.E }, HAND_RECEIVABLE.E);
  const folded = await api('GET', `/ledger/aging?tag=${encodeURIComponent('route  2')}`, null, token);
  record('the tag matches as the party list does — case and inner spaces folded',
    (folded.body?.data ?? []).map((r) => r.party.name).join() === nameOf.E,
    (folded.body?.data ?? []).map((r) => r.party.name).join() || `status ${folded.status}`);

  // ── 3. Ordering ──────────────────────────────────────────────────────────
  // The tie between Bhatia and bansal (₹0 at 90+, ₹2,500 total) is broken by
  // the party id — descending under a descending sort, ascending under an
  // ascending one — so the pair keeps ONE order between refreshes.
  const [tieHi, tieLo] = [ids.B, ids.F].sort().reverse().map((id) => keyOf[id]);
  const orderOf = (response) => (response.body?.data ?? []).map((r) => keyOf[r.party.id]).join('');
  const expectOrder = {
    '-90_plus': ['C', 'G', 'A', tieHi, tieLo, 'E'].join(''),
    '90_plus': ['E', tieLo, tieHi, 'A', 'G', 'C'].join(''),
    name: 'AFBCEG', // Arora, bansal, Bhatia, Chawla, Eknath, Gupta — case-folded
    '-name': 'GECBFA',
    '-total': ['A', tieHi, tieLo, 'E', 'G', 'C'].join(''),
  };
  const defaultOrder = await api('GET', '/ledger/aging', null, token);
  record('the default order is -90_plus: Chawla (₹600 at 90+) first, then Gupta (₹400.40)',
    orderOf(defaultOrder) === expectOrder['-90_plus'],
    `got ${orderOf(defaultOrder)} want ${expectOrder['-90_plus']}`);
  for (const ordering of Object.keys(expectOrder)) {
    const response = await api('GET', `/ledger/aging?ordering=${encodeURIComponent(ordering)}`, null, token);
    record(`ordering=${ordering}`, orderOf(response) === expectOrder[ordering],
      `got ${orderOf(response)} want ${expectOrder[ordering]} (${(response.body?.data ?? []).map((r) => r.party.name).join(', ')})`);
  }
  const again = await Promise.all([1, 2, 3].map(() => api('GET', '/ledger/aging', null, token)));
  record('ties are stable: three more reads return the same sequence',
    again.every((r) => orderOf(r) === orderOf(defaultOrder)), again.map(orderOf).join(' / '));
  const bogus = await api('GET', '/ledger/aging?ordering=balance', null, token);
  record('an ordering the report does not offer is a 400', bogus.status === 400, `status ${bogus.status}`);

  const page2 = await api('GET', '/ledger/aging?page=2&page_size=2', null, token);
  record('paging slices the ordered report (page 2 of 2-per-page is rows 3–4)',
    orderOf(page2) === expectOrder['-90_plus'].slice(2, 4) && page2.body?.meta?.total === 6,
    `got ${orderOf(page2)} total ${page2.body?.meta?.total}`);

  // ── 4. The CSV ───────────────────────────────────────────────────────────
  const csv = await api('GET', '/ledger/aging?format=csv', null, token);
  if (csv.status === 200) exportsSpent += 1;
  const csvLines = String(csv.body ?? '').trim().split(/\r?\n/);
  record('the export is text/csv with an attachment disposition',
    csv.status === 200 && (csv.headers.get('content-type') ?? '').startsWith('text/csv') &&
      (csv.headers.get('content-disposition') ?? '').includes(`attachment; filename="aging-receivable-${today}.csv"`),
    `${csv.status} · ${csv.headers.get('content-type')} · ${csv.headers.get('content-disposition')}`);
  record('it has a header row and one line per party',
    csvLines[0] === 'party,0_30,31_60,61_90,90_plus,total' && csvLines.length === 1 + 6,
    `${csvLines.length} lines; header "${csvLines[0]}"`);
  const csvExpected = (defaultOrder.body?.data ?? []).map((r) => [r.party.name, ...BUCKETS.map((b) => r[b]), r.total].join(','));
  record('every line carries the same figures as the report, in the report\'s order',
    JSON.stringify(csvLines.slice(1)) === JSON.stringify(csvExpected),
    csvLines.slice(1).join(' | '));
  const csvTagged = await api('GET', `/ledger/aging?format=csv&tag=${encodeURIComponent('Route 2')}`, null, token);
  if (csvTagged.status === 200) exportsSpent += 1;
  const taggedLines = String(csvTagged.body ?? '').trim().split(/\r?\n/);
  record('the export honours the tag filter too',
    taggedLines.length === 2 && taggedLines[1] === `${nameOf.E},0.00,0.00,1234.56,0.00,1234.56`,
    taggedLines.join(' | '));

  // The audit row. There is no audit-log API (PLT-11 has not landed), so this
  // reads platform_audit_log through the ORM — the same table §16 names.
  try {
    const code = [
      'import json',
      'from apps.platform_app.models.audit import AuditLog',
      `rows = AuditLog.objects.filter(action="ledger.aging.exported", actor__email=${JSON.stringify(OWNER.email)}).order_by("created_at")`,
      'print(json.dumps([dict(entity_type=r.entity_type, tenant=str(r.tenant_id), metadata=r.metadata) for r in rows]))',
    ].join('\n');
    const out = execFileSync('python3', ['manage.py', 'shell', '-c', code], {
      cwd: BACKEND_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    });
    const rows = JSON.parse(out.trim().split('\n').pop());
    const [first, second] = rows;
    record('each export wrote an audit row with its parameters and row count (DB — no audit API yet)',
      rows.length === exportsSpent &&
        first?.entity_type === 'ledger_aging' && first?.metadata?.row_count === 6 &&
        first?.metadata?.params?.type === 'receivable' && first?.metadata?.params?.as_of === today &&
        second?.metadata?.row_count === 1 && second?.metadata?.params?.tag === 'Route 2',
      JSON.stringify(rows));
  } catch (error) {
    record('each export wrote an audit row with its parameters and row count (DB — no audit API yet)', false,
      `could not read the audit table: ${String(error.stderr || error.message).slice(0, 300)}`);
  }

  // ── 5. The browser ───────────────────────────────────────────────────────
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  // Any export the browser gets through to the API spends the same budget.
  context.on('response', (response) => {
    const url = new URL(response.url());
    // RPT-05: with Reports enabled the button downloads /reports/receivables-aging
    // (or payables-aging) instead. It is charged to the same "export" scope, so it
    // is counted here too, or the 429 check below lands one export late.
    const exportPaths = [`${BACKEND}/ledger/aging`, `${BACKEND}/reports/receivables-aging`, `${BACKEND}/reports/payables-aging`];
    if (exportPaths.includes(`${url.origin}${url.pathname}`) && url.searchParams.get('format') === 'csv' &&
        response.status() === 200) exportsSpent += 1;
  });
  const page = await context.newPage();
  await signIn(page);

  {
    const opened = await openAging(page);
    record('browser: the page asks for receivable, as of today, oldest money first',
      opened.params.type === 'receivable' && opened.params.as_of === today && opened.params.ordering === '-90_plus',
      JSON.stringify(opened.params));
    const tiles = await tilesSettle(page, HAND_RECEIVABLE_TOTALS);
    record('browser: the four tiles show the API\'s bucket totals',
      tilesMatch(tiles, HAND_RECEIVABLE_TOTALS),
      `got ${JSON.stringify(tiles)} want ${JSON.stringify(expectedTiles(HAND_RECEIVABLE_TOTALS))}`);
    const tabs = await page.getByRole('tab').allInnerTexts();
    record('browser: the tabs carry the position — You will get ₹10,835.56 · You will give ₹2,000.00',
      tabs.some((t) => /You will get/.test(t) && t.includes(inr(HAND_RECEIVABLE_TOTALS.total))) &&
        tabs.some((t) => /You will give/.test(t) && t.includes(inr('2000.00'))),
      tabs.map((t) => t.replace(/\s+/g, ' ')).join(' | '));
    const names = await gridNames(page, allNames);
    const wantNames = (opened.body?.data ?? []).map((r) => r.party.name);
    record('browser: every row renders, in the order the server sent',
      JSON.stringify(names) === JSON.stringify(wantNames), `got ${names.join(', ')} want ${wantNames.join(', ')}`);
    const rowText = await page.getByTestId('aging-screen').innerText();
    const missing = Object.entries(HAND_RECEIVABLE).flatMap(([k, row]) =>
      [...BUCKETS, 'total'].filter((f) => paise(row[f]) > 0 && !rowText.includes(inr(row[f]))).map((f) => `${nameOf[k]} ${f} ${inr(row[f])}`));
    record('browser: every non-zero figure of every row is on the screen', missing.length === 0, missing.join(' | '));

    // The As-of date changes the REQUEST.
    const asOfPick = shift(today, 8);
    const sent = page.waitForRequest((r) => isAgingRead(r) && paramsOf(r).as_of === asOfPick, { timeout: 30000 }).catch(() => null);
    await pickAsOf(page, asOfPick);
    const request = await sent;
    record(`browser: choosing ${asOfPick} in "As of" sends as_of=${asOfPick}`,
      Boolean(request), request ? JSON.stringify(paramsOf(request)) : 'no aging request carried it');
    record('browser: and the address bar carries it',
      new URL(page.url()).searchParams.get('as_of') === asOfPick, page.url());
    const pickModel = modelAging(today, asOfPick, 'receivable');
    const pickTotals = sumRows(pickModel);
    const pickTiles = await tilesSettle(page, pickTotals);
    record(`browser: the tiles move to the ${asOfPick} figures (Chawla's ₹400 not paid yet, so 90+ is his whole ₹1,000)`,
      tilesMatch(pickTiles, pickTotals) && pickTotals['90_plus'] === '1000.00',
      `got ${JSON.stringify(pickTiles)} want ${JSON.stringify(expectedTiles(pickTotals))}`);

    // Drill-down from the party cell (a link on a table).
    const statementReq = page.waitForRequest((r) => r.url().startsWith(`${BACKEND}/parties/${ids.C}/statement`), { timeout: 60000 }).catch(() => null);
    await page.getByRole('link', { name: nameOf.C, exact: true }).click();
    await page.waitForURL((url) => url.pathname === `/parties/${ids.C}/statement`, { timeout: 60000 }).catch(() => {});
    const landed = new URL(page.url());
    record('browser (desktop): the party link lands on that party\'s statement with to = the as-of',
      landed.pathname === `/parties/${ids.C}/statement` && landed.searchParams.get('to') === asOfPick &&
        landed.searchParams.get('preset') === 'custom',
      page.url());
    const stmt = await statementReq;
    record('browser (desktop): and the statement request carries date_to = the as-of',
      Boolean(stmt) && paramsOf(stmt).date_to === asOfPick, stmt ? JSON.stringify(paramsOf(stmt)) : 'no statement request');

    // The Payable tab.
    await openAging(page);
    const payReq = page.waitForRequest((r) => isAgingRead(r) && paramsOf(r).type === 'payable', { timeout: 30000 }).catch(() => null);
    await page.getByRole('tab', { name: /You will give/ }).click();
    const payParams = await payReq;
    record('browser: the Payable tab sends type=payable', Boolean(payParams),
      payParams ? JSON.stringify(paramsOf(payParams)) : 'no request');
    const payTiles = await tilesSettle(page, HAND_PAYABLE.D);
    const payNames = await gridNames(page, allNames);
    record('browser: the Payable tab shows the supplier only, with the supplier\'s tiles',
      JSON.stringify(payNames) === JSON.stringify([nameOf.D]) && tilesMatch(payTiles, HAND_PAYABLE.D),
      `rows ${payNames.join(', ')} · tiles ${JSON.stringify(payTiles)}`);

    // The tag filter, as the URL the tag manager links to.
    const tagOpened = await openAging(page, `?tag=${encodeURIComponent('Route 2')}`);
    const tagTiles = await tilesSettle(page, HAND_RECEIVABLE.E);
    const tagNames = await gridNames(page, allNames);
    record('browser: ?tag=Route 2 reaches the request and narrows the screen to Eknath',
      tagOpened.params.tag === 'Route 2' && JSON.stringify(tagNames) === JSON.stringify([nameOf.E]) &&
        tilesMatch(tagTiles, HAND_RECEIVABLE.E),
      `params ${JSON.stringify(tagOpened.params)} · rows ${tagNames.join(', ')} · tiles ${JSON.stringify(tagTiles)}`);

    // The Export button is a file download of the CSV.
    await openAging(page);
    const link = page.getByTestId('aging-export');
    const href = await link.getAttribute('href');
    const download = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    await link.click();
    const file = await download;
    let content = '';
    if (file) content = readFileSync(await file.path(), 'utf8');
    // RPT-05 / RPT-08: the button now downloads the Reports file: FR-5's columns,
    // starting party_name,mobile,party_type,tags, with a UTF-8 BOM so Excel reads ₹.
    const REPORT_HEADER = 'party_name,mobile,party_type,tags,collection_date,credit_limit,';
    const firstLine = content.split(/\r?\n/)[0] ?? '';
    record('browser: Export CSV downloads the CSV (header row first)',
      Boolean(file) && firstLine.startsWith(`\uFEFF${REPORT_HEADER}`),
      file
        ? `href ${href} → saved "${file.suggestedFilename()}" from ${file.url()}, starts "${content.slice(0, 60).replace(/\n/g, '\\n')}"`
        : `href ${href}; no download`);
  }

  // Phone: a row CARD is the tap target (no links inside a button).
  {
    await page.setViewportSize({ width: 360, height: 780 });
    await openAging(page);
    const tiles = await tilesSettle(page, HAND_RECEIVABLE_TOTALS);
    record('browser (phone): the tiles show the same figures', tilesMatch(tiles, HAND_RECEIVABLE_TOTALS), JSON.stringify(tiles));
    const cards = await page.getByTestId('ub-grid-card').count();
    record('browser (phone): one card per party', cards === 6, `${cards} cards`);
    const statementReq = page.waitForRequest((r) => r.url().startsWith(`${BACKEND}/parties/${ids.G}/statement`), { timeout: 60000 }).catch(() => null);
    await page.getByRole('button', { name: `Open the statement for ${nameOf.G}` }).click();
    await page.waitForURL((url) => url.pathname === `/parties/${ids.G}/statement`, { timeout: 60000 }).catch(() => {});
    const landed = new URL(page.url());
    const stmt = await statementReq;
    record('browser (phone): tapping a card lands on the statement with to = the as-of (today)',
      landed.pathname === `/parties/${ids.G}/statement` && landed.searchParams.get('to') === today &&
        Boolean(stmt) && paramsOf(stmt).date_to === today,
      `${page.url()} · ${stmt ? JSON.stringify(paramsOf(stmt)) : 'no statement request'}`);
  }

  // Widths: nothing runs off the screen, on each tab this report has.
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    if (wantShots) mkdirSync(`${SHOT_DIR}/${size.id}`, { recursive: true });
    const views = [
      ['1-receivable', ''],
      ['2-payable', '?type=payable'],
      ['3-tag-route-2', `?tag=${encodeURIComponent('Route 2')}`],
    ];
    const overflows = [];
    for (const [shot, query] of views) {
      await openAging(page, query);
      // The pointer is parked off the grid, so a card the phone check tapped
      // earlier is not photographed in its hover state.
      await page.mouse.move(0, 0);
      await page.waitForTimeout(600);
      overflows.push(`${shot} ${await overflowOf(page)}px`);
      if (wantShots) await page.screenshot({ path: `${SHOT_DIR}/${size.id}/${shot}.png`, fullPage: true });
    }
    record(`${size.id} ${size.width}px: no view is wider than the viewport`,
      overflows.every((o) => Number(o.split(' ')[1].replace('px', '')) <= 0), overflows.join(' · '));
  }
  await browser.close();

  // ── 6. The export budget ─────────────────────────────────────────────────
  // Last, because it spends the rest of this user's hour. Everything exported
  // above — by the API and by the browser — came out of the same ten.
  const before = exportsSpent;
  let refusedAt = null;
  for (let attempt = 0; attempt < EXPORT_LIMIT + 2 && refusedAt === null; attempt += 1) {
    const response = await api('GET', '/ledger/aging?format=csv', null, token);
    if (response.status === 200) exportsSpent += 1;
    else if (response.status === 429) refusedAt = exportsSpent + 1;
    else { refusedAt = `unexpected ${response.status}`; }
  }
  record(`the ${EXPORT_LIMIT + 1}th export in an hour is 429`,
    refusedAt === EXPORT_LIMIT + 1, `refused at export #${refusedAt} (${before} spent before the loop)`);
  const stillReads = await api('GET', '/ledger/aging', null, token);
  const stillSummary = await api('GET', '/ledger/summary', null, token);
  record('and the report itself still reads (JSON 200, same figures)',
    stillReads.status === 200 && stillSummary.status === 200 && sameFigures(stillReads.body?.meta?.totals, HAND_RECEIVABLE_TOTALS),
    `aging ${stillReads.status} · summary ${stillSummary.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed${wantShots ? ` · screenshots in ${SHOT_DIR}` : ''}`);
  process.exit(passed === results.length ? 0 : 1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
