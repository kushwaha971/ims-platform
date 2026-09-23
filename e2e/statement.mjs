#!/usr/bin/env node
/**
 * e2e/statement.mjs — LED-04's hisaab, against a real browser and a real server,
 * plus the screenshot sweep that goes with it.
 *
 * ── What only a live stack can answer ──────────────────────────────────────
 *
 *   1. **The running balance survives pagination.** It is the one figure in this
 *      product that no other screen computes, and the way it breaks is silent:
 *      Django computes a window function AFTER the keyset filter, so page two
 *      restarts from zero while page one — the page every unit test and every
 *      screenshot looks at — is correct. Measured on five rows during the build:
 *      paging from the third returned 100, 200, 300 where the truth is 300, 400,
 *      500. Only a real cursor over a real book exercises it.
 *   2. **The closing balance agrees with the khata page.** Two independent
 *      calculations — a cached column moved one entry at a time, and a window
 *      function replaying every row — have to arrive at the same number, and
 *      they can only be compared where both exist.
 *   3. **The period reaches the WIRE.** `e2e/parties.mjs` exists because a set
 *      of chips validated, rendered and saved with a 201 while the service
 *      dropped every one of them. A period the merchant chose and the request
 *      did not carry is the same defect on the screen a customer reads.
 *   4. **The CSV is a file and not a page.** It streams with a
 *      `Content-Disposition`, and whether a browser saves it or renders it is
 *      not something jsdom can be asked.
 *   5. **The print sheet exists in the DOM and the app does not.** jsdom applies
 *      no stylesheet, so the only place the `@media print` rules can be checked
 *      is a browser that can emulate print media.
 *
 * ── What is deliberately NOT here ──────────────────────────────────────────
 * Share links, the public page and the UPI QR — FR-6, FR-7, §7.5 and AC-3/AC-5.
 * `parties_share_link` has no table AND no agreed shape: Part 43 §43.4.6 C1 is
 * an open contradiction between two chapters and says "must be answered before
 * the first migration". Inventing a narrow table to unblock a harness is the
 * exact trap that contradiction names. The QR needs PAY-03's encoder, which is
 * blocked on its own ADR contradiction (C3), and a `tenant.upi_vpa` that PLT-07
 * would collect.
 *
 *   ./e2e/serve-api.sh && ./e2e/serve.sh
 *   node e2e/statement.mjs
 *   node e2e/statement.mjs --shots
 *
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots/statement';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

const stamp = Date.now();
const OWNER = { email: `stmt-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };
const STAFF = { email: `stmt-staff-${stamp}@shop.test`, password: 'Dukaan2026x' };

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
];

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
  const payload =
    response.status === 204 || (response.headers.get('content-type') ?? '').includes('csv')
      ? await response.text().catch(() => null)
      : await response.json().catch(() => null);
  return { status: response.status, body: payload, headers: response.headers };
};

const must = async (...args) => {
  const response = await api(...args);
  if (response.status >= 400) {
    throw new Error(`${args[0]} ${args[1]} ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
};

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const postEntry = (partyId, body, token, index) =>
  must(
    'POST',
    `/parties/${partyId}/ledger-entries`,
    { direction: 'debit', amount: '100.00', entry_date: daysAgo(1), ...body },
    token,
    { 'Idempotency-Key': `stmt-${stamp}-${partyId}-${index}` }
  );

/**
 * A book with a SHAPE, because the interesting cases are all about ordering.
 *
 * `paged` gets thirty entries across thirty days, which is what makes page two
 * reachable at the 50-row default only once the limit is lowered — so the
 * cursor check asks for a small page deliberately rather than seeding a
 * thousand rows to reach the same boundary.
 */
async function seed() {
  const registered = await must('POST', '/auth/register', {
    email: OWNER.email,
    password: OWNER.password,
    full_name: OWNER.name,
  });
  await must(
    'POST',
    '/tenants',
    { name: 'Kumar Stores', business_type: 'retail', state_code: '27' },
    registered.body.data.access_token,
    { 'Idempotency-Key': `tenant-${stamp}` }
  );
  const scoped = await must('POST', '/auth/login', {
    email: OWNER.email,
    password: OWNER.password,
  });
  const token = scoped.body.data.access_token;

  const parties = {};
  const make = async (key, name, extra = {}) => {
    const made = await must(
      'POST',
      '/parties',
      { name, is_customer: true, mobile: null, ...extra },
      token,
      { 'Idempotency-Key': `party-${stamp}-${key}` }
    );
    parties[key] = { key, name, id: made.body.data.id };
    return parties[key];
  };

  /* AC-1's party, to the rupee: an opening of ₹2,300 dated a while back, then
     ₹500 given and ₹300 received on one day. The running balances are
     2,300 → 2,800 → 2,500 and the closing is ₹2,500, which is what the khata
     page must also say. */
  const passbook = await make('passbook', 'Ramesh Traders', {
    mobile: '9876543210',
    opening_balance_amount: '2300.00',
    opening_balance_direction: 'debit',
    opening_balance_as_of: daysAgo(60),
  });
  await postEntry(passbook.id, { amount: '500.00', note: 'Cement bags', entry_date: daysAgo(3) }, token, 1);
  await postEntry(
    passbook.id,
    { direction: 'credit', amount: '300.00', payment_mode: 'cash', entry_date: daysAgo(3) },
    token,
    2
  );

  // Thirty days, one entry each, for the cursor.
  const paged = await make('paged', 'Bhavna Stores');
  for (let index = 0; index < 30; index += 1) {
    await postEntry(
      paged.id,
      { amount: '100.00', entry_date: daysAgo(30 - index) },
      token,
      `p${index}`
    );
  }

  // A party in advance: every running balance is negative.
  const advance = await make('advance', 'Chetan Mart');
  await postEntry(
    advance.id,
    { direction: 'credit', amount: '2000.00', payment_mode: 'upi', reference: 'UTR-ADV' },
    token,
    'adv'
  );

  // A party with nothing in it, for the empty state.
  await make('quiet', 'Divya Agency');

  /* A corrected book, for AC-4: the closing must not move when the struck-through
     pair is revealed. Built through the real correction endpoint. */
  const fixed = await make('fixed', 'Esha & Sons');
  const wrong = await postEntry(
    fixed.id,
    { amount: '500.00', note: 'Sand load', entry_date: daysAgo(2) },
    token,
    'fix1'
  );
  await must(
    'POST',
    `/ledger-entries/${wrong.body.data.id}/correct`,
    { amount: '550.00', reason: 'Recounted the load' },
    token,
    { 'Idempotency-Key': `fix-${stamp}` }
  );

  /* FR-11's warning: an opening dated a month ago with an entry backdated
     before it. No arithmetic can tell a merchant this — both numbers are
     right — so the sentence is the only thing that can. */
  const early = await make('early', 'Farhan Supply', {
    opening_balance_amount: '1000.00',
    opening_balance_direction: 'debit',
    opening_balance_as_of: daysAgo(30),
  });
  await postEntry(early.id, { amount: '250.00', entry_date: daysAgo(45) }, token, 'early');

  return { token, parties };
}

// ── The browser ─────────────────────────────────────────────────────────────

const settle = (page, ms = 900) => page.waitForTimeout(ms);

const signIn = async (page, who = OWNER) => {
  for (const attempt of [1, 2]) {
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.fill('input[type="email"], input[name="email"]', who.email);
    await page.fill('input[type="password"], input[name="password"]', who.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try {
      await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 20000 });
      await page.waitForTimeout(600);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
};

const openStatement = async (page, party, query = '') => {
  await page.goto(`${FRONTEND}/parties/${party.id}/statement${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForSelector('[data-testid="statement-screen"]', { timeout: 45000 });
  await settle(page, 1400);
};

/** The on-screen half. The print sheet is in the DOM too — see the page. */
const screenText = (page) => page.locator('[data-testid="statement-screen"]').innerText();

// ── The sweep ───────────────────────────────────────────────────────────────

const shots = [];
const missed = [];

const capture = async (page, size, name) => {
  if (!wantShots) return;
  const dir = `${SHOT_DIR}/${size.id}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  shots.push(`${size.id}/${name}.png`);
};

const step = async (label, page, fn) => {
  try {
    await fn();
  } catch (error) {
    missed.push(`${label}: ${String(error).split('\n')[0]}`);
    const dir = `${SHOT_DIR}/_failures`;
    mkdirSync(dir, { recursive: true });
    await page
      .screenshot({ path: `${dir}/${label.replace(/\s+/g, '-')}.png`, fullPage: true })
      .catch(() => undefined);
  }
};

async function sweep(ctx, size, parties) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: size.width, height: size.height });
  const at = (name, fn) => step(`${size.id} ${name}`, page, fn);

  await signIn(page);

  /* The two measurements, on the page with the most in a row. A statement is
     five columns of money on a laptop and three stacked figures on a phone, and
     the class of defect these catch is the one `innerText` cannot see — it
     returns the whole string whatever the pixels do. */
  await at('00-no-horizontal-overflow', async () => {
    for (const party of [parties.passbook, parties.fixed]) {
      await openStatement(page, party);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 1) {
        throw new Error(`${size.id}: the statement is ${overflow}px wider than the screen`);
      }
    }
  });

  await at('00-nothing-clipped', async () => {
    for (const party of [parties.passbook, parties.fixed, parties.advance]) {
      await openStatement(page, party);
      const clipped = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('[data-testid="statement-screen"] p, [data-testid="statement-screen"] span, [data-testid="statement-screen"] div')
        )
          .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
          .filter((node) => !node.className.toString().includes('sr-only'))
          .filter((node) => node.scrollWidth - node.clientWidth > 1)
          .map((node) => (node.textContent ?? '').trim())
          .slice(0, 6)
      );
      if (clipped.length > 0) throw new Error(`${size.id}: clipped — ${clipped.join(' | ')}`);
    }
  });

  await at('01-statement', async () => {
    await openStatement(page, parties.passbook);
    await capture(page, size, '01-statement');
  });

  await at('02-statement-paged', async () => {
    await openStatement(page, parties.paged);
    await capture(page, size, '02-statement-paged');
  });

  await at('03-statement-advance', async () => {
    await openStatement(page, parties.advance);
    await capture(page, size, '03-statement-advance');
  });

  await at('04-statement-empty-period', async () => {
    await openStatement(page, parties.quiet);
    await capture(page, size, '04-statement-empty-period');
  });

  await at('05-period-custom', async () => {
    await openStatement(page, parties.passbook);
    await page.getByRole('button', { name: 'Custom' }).first().click();
    await settle(page, 900);
    await capture(page, size, '05-period-custom');
  });

  await at('06-corrections-shown', async () => {
    await openStatement(page, parties.fixed, '?preset=allTime&corrections=true');
    await capture(page, size, '06-corrections-shown');
  });

  await at('07-before-opening-warning', async () => {
    await openStatement(page, parties.early, '?preset=allTime');
    const warning = page.getByText(/before the opening balance date/).first();
    await warning.waitFor({ state: 'visible', timeout: 10000 });
    await warning.scrollIntoViewIfNeeded();
    await settle(page, 500);
    await capture(page, size, '07-before-opening-warning');
  });

  await at('08-range-refused', async () => {
    await openStatement(page, parties.passbook, '?preset=custom&from=2015-01-01&to=2026-04-01');
    const refusal = page.getByText(/up to 5 years/).first();
    await refusal.waitFor({ state: 'visible', timeout: 10000 });
    await settle(page, 400);
    await capture(page, size, '08-range-refused');
  });

  /* §7 — the print SHEET, which is hidden on screen and is the only thing on
     paper. Photographed with print media emulated, because that is the only
     state in which the stylesheet applies; a screenshot without it is a
     screenshot of the app, which is what shots 01-08 already are. */
  await at('09-print-sheet', async () => {
    await openStatement(page, parties.passbook, '?preset=allTime');
    await page.emulateMedia({ media: 'print' });
    await settle(page, 700);
    await capture(page, size, '09-print-sheet');
    await page.emulateMedia({ media: 'screen' });
  });

  await at('10-print-sheet-corrected', async () => {
    await openStatement(page, parties.fixed, '?preset=allTime&corrections=true');
    await page.emulateMedia({ media: 'print' });
    await settle(page, 700);
    await capture(page, size, '10-print-sheet-corrected');
    await page.emulateMedia({ media: 'screen' });
  });

  await page.close();
}

// ── The checks ──────────────────────────────────────────────────────────────

async function checks(browser, token, parties) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // 1. AC-1 — the passbook reads as a passbook.
  {
    const page = await ctx.newPage();
    await signIn(page);
    await openStatement(page, parties.passbook, '?preset=allTime');
    const body = await screenText(page);
    record(
      'the statement shows the opening, the entries and the closing',
      body.includes('Cement bags') && body.includes('₹2,500.00'),
      body.split('\n').filter((line) => /2,500|Cement/.test(line)).slice(0, 3).join(' | ')
    );
    /* GROUPED, and the grouping is the assertion rather than a detail: it
       printed "Balance ₹2800.00" until the screenshot sweep showed it, which is
       the fifth time a raw decimal string and `formatInr` have met in this
       codebase — on the figure a merchant reads out loud at a counter. */
    record(
      'and a grouped running balance under every row',
      /Balance ₹2,800\.00/.test(body) && /Balance ₹2,500\.00/.test(body),
      body.split('\n').filter((line) => line.startsWith('Balance ₹')).join(' | ')
    );
    await page.close();
  }

  // 2. BR-3 — the closing agrees with the khata page, by two different routes.
  {
    const statement = await must(
      'GET',
      `/parties/${parties.passbook.id}/statement`,
      null,
      token
    );
    const party = await must('GET', `/parties/${parties.passbook.id}`, null, token);
    /* The single most valuable assertion in this feature. A cached column moved
       one entry at a time and a window function replaying every row have to
       arrive at the same number; if they ever differ, every figure in the
       product is suspect. */
    record(
      'the unbounded closing balance equals the party balance',
      statement.body.data.closing_balance === party.body.data.balance,
      `statement ${statement.body.data.closing_balance} vs party ${party.body.data.balance}`
    );
  }

  // 3. The running balance survives the cursor — the silent one.
  {
    const first = await must(
      'GET',
      `/parties/${parties.paged.id}/statement?limit=10`,
      null,
      token
    );
    const second = await must(
      'GET',
      `/parties/${parties.paged.id}/statement?limit=10&cursor=${encodeURIComponent(first.body.meta.next_cursor)}`,
      null,
      token
    );
    const firstRun = first.body.data.rows.map((row) => row.running_balance);
    const secondRun = second.body.data.rows.map((row) => row.running_balance);
    record(
      'page one accumulates from the opening',
      firstRun[0] === '100.00' && firstRun[9] === '1000.00',
      `${firstRun[0]} … ${firstRun[9]}`
    );
    /* Django computes a window AFTER the keyset filter, so the naive
       implementation restarts page two at 100.00. Page ONE is correct, which is
       the page every unit test and every screenshot looks at. */
    record(
      'and page two continues rather than restarting at zero',
      secondRun[0] === '1100.00' && secondRun[9] === '2000.00',
      `${secondRun[0]} … ${secondRun[9]}`
    );
  }

  // 4. AC-2 — a narrowed period carries its opening.
  {
    const narrowed = await must(
      'GET',
      `/parties/${parties.paged.id}/statement?date_from=${daysAgo(5)}`,
      null,
      token
    );
    const rows = narrowed.body.data.rows;
    record(
      'a narrowed period opens at what was owed before it',
      narrowed.body.data.opening_balance === '2500.00' && rows.length === 5,
      `opening ${narrowed.body.data.opening_balance}, ${rows.length} rows`
    );
    record(
      'and its first running balance continues from that opening',
      rows[0]?.running_balance === '2600.00',
      rows[0]?.running_balance ?? '(no rows)'
    );
  }

  // 5. AC-4 — corrections change what is listed and not what is owed.
  {
    const clean = await must('GET', `/parties/${parties.fixed.id}/statement`, null, token);
    const full = await must(
      'GET',
      `/parties/${parties.fixed.id}/statement?include_corrections=true`,
      null,
      token
    );
    record(
      'showing corrections adds the struck-through pair',
      clean.body.data.rows.length === 1 && full.body.data.rows.length === 3,
      `${clean.body.data.rows.length} rows clean, ${full.body.data.rows.length} with corrections`
    );
    /* Canon §0.2's arithmetic, restated: the pair nets to zero. If these two
       ever differ, the balance rule is broken somewhere. */
    record(
      'and does not move the closing balance by a paisa',
      clean.body.data.closing_balance === full.body.data.closing_balance,
      `${clean.body.data.closing_balance} vs ${full.body.data.closing_balance}`
    );
  }

  // 6. The period reaches the wire — the `e2e/parties.mjs` class of defect.
  {
    const page = await ctx.newPage();
    const asked = [];
    page.on('request', (req) => {
      if (req.url().includes('/statement')) asked.push(req.url());
    });
    await signIn(page);
    await openStatement(page, parties.passbook);
    await page.getByRole('button', { name: 'All time' }).first().click();
    await settle(page, 1800);

    record(
      'choosing a period changes the request, not just the chip',
      asked.some((url) => url.includes('date_from')) &&
        asked.some((url) => !url.includes('date_from')),
      `${asked.length} requests; last ${asked[asked.length - 1]?.split('/statement')[1] ?? ''}`
    );
    record(
      'and the address bar carries it so the page is linkable',
      page.url().includes('preset=allTime'),
      page.url().split('?')[1] ?? '(no query)'
    );
    await page.close();
  }

  // 7. FR-11 — the warning no arithmetic can give.
  {
    const early = await must(
      'GET',
      `/parties/${parties.early.id}/statement`,
      null,
      token
    );
    record(
      'an entry dated before the opening balance is flagged',
      early.body.data.has_entries_before_opening === true,
      String(early.body.data.has_entries_before_opening)
    );
  }

  // 8. §10 — the two ranges the server refuses.
  {
    const inverted = await api(
      'GET',
      `/parties/${parties.passbook.id}/statement?date_from=2026-05-01&date_to=2026-04-01`,
      null,
      token
    );
    const enormous = await api(
      'GET',
      `/parties/${parties.passbook.id}/statement?date_from=2000-01-01&date_to=2026-04-01`,
      null,
      token
    );
    record(
      'an inverted range and a decade-long one are both refused',
      inverted.status === 400 && enormous.status === 400,
      `${inverted.status} / ${enormous.status}`
    );
  }

  // 9. BR-6 — the mobile is masked in the payload a share link would carry.
  {
    const body = (await must('GET', `/parties/${parties.passbook.id}/statement`, null, token)).body;
    record(
      "the customer's mobile is masked, not sent",
      body.data.party.mobile_masked === '98••• ••210' &&
        !JSON.stringify(body.data.party).includes('9876543210'),
      body.data.party.mobile_masked
    );
  }

  // 10. FR-10 / BR-8 / §19 — the CSV.
  {
    const csv = await api(
      'GET',
      `/parties/${parties.passbook.id}/statement?format=csv`,
      null,
      token
    );
    const lines = String(csv.body ?? '').trim().split('\n');
    record(
      'the export is a CSV file rather than a JSON page',
      (csv.headers.get('content-type') ?? '').includes('text/csv') &&
        (csv.headers.get('content-disposition') ?? '').includes('attachment'),
      `${csv.headers.get('content-type')} · ${csv.headers.get('content-disposition')}`
    );
    record(
      'with the column names BR-8 fixes and a running balance in each row',
      lines[0]?.startsWith('date,particulars,document_number,you_gave,you_got,balance') &&
        lines.length === 4,
      `${lines.length - 1} rows; ${lines[0]?.slice(0, 48)}`
    );
  }

  // 11. §19 — a note that a spreadsheet would run.
  {
    const dangerous = await must(
      'POST',
      `/parties/${parties.quiet.id}/ledger-entries`,
      { direction: 'debit', amount: '10.00', entry_date: daysAgo(1), note: '=SUM(A1:A9)' },
      token,
      { 'Idempotency-Key': `formula-${stamp}` }
    );
    const csv = await api(
      'GET',
      `/parties/${parties.quiet.id}/statement?format=csv`,
      null,
      token
    );
    record(
      'a note that looks like a formula is neutralised in the export',
      String(csv.body).includes("'=SUM(A1:A9)"),
      String(csv.body).split('\n')[1]?.slice(0, 40) ?? ''
    );
    if (!dangerous.body) record('seeding the formula note', false);
  }

  // 12. §12 — who may take the book away.
  {
    const staffToken = await staffSession(token);
    const read = await api('GET', `/parties/${parties.passbook.id}/statement`, null, staffToken);
    const exported = await api(
      'GET',
      `/parties/${parties.passbook.id}/statement?format=csv`,
      null,
      staffToken
    );
    record(
      'staff may read a statement and may not export it',
      read.status === 200 && exported.status === 403,
      `read ${read.status}, export ${exported.status}`
    );

    /* Its OWN browser context, and the identity asserted first. `ctx` is shared
       by every check in this file and the owner signed into it pages ago —
       `e2e/ledger.mjs` reported a permission leak for exactly that reason and
       it was the harness asserting against the owner. */
    const staffCtx = await browser.newContext();
    const page = await staffCtx.newPage();
    await signIn(page, STAFF);
    const whoami = await api('GET', '/auth/me', null, staffToken);
    record(
      'the staff session in the browser is the staff member',
      whoami.body?.data?.user?.email === STAFF.email,
      whoami.body?.data?.user?.email ?? '?'
    );
    await openStatement(page, parties.passbook, '?preset=allTime');
    const body = await screenText(page);
    record(
      'and the export button is absent rather than disabled',
      !body.includes('Export CSV') && body.includes('Print'),
      body.includes('Export CSV') ? 'still offered' : 'hidden'
    );
    await page.close();
    await staffCtx.close();
  }

  // 13. Canon §0.11 rule 2.
  {
    const other = await api(
      'GET',
      `/parties/${parties.passbook.id}/statement`,
      null,
      'not-a-token'
    );
    record(
      'an unauthenticated request is refused',
      other.status === 401,
      String(other.status)
    );
  }

  // 14. The khata page offers the way in.
  {
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${FRONTEND}/parties/${parties.passbook.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForSelector('text=Transactions', { timeout: 45000 });
    await settle(page, 1200);
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await settle(page, 600);
    await page.getByRole('button', { name: 'Statement' }).click();
    await page.waitForSelector('[data-testid="statement-screen"]', { timeout: 30000 });
    /* A route nothing links to is a route nobody reaches. LED-04's whole
       argument for its own address is that a merchant navigates to it. */
    record(
      'the khata page menu reaches the statement',
      page.url().includes('/statement'),
      page.url().split('/parties/')[1] ?? page.url()
    );
    await page.close();
  }

  // 15. §7 — the print sheet is in the DOM and the app is not, under print media.
  {
    const page = await ctx.newPage();
    await signIn(page);
    await openStatement(page, parties.passbook, '?preset=allTime');
    await page.emulateMedia({ media: 'print' });
    await settle(page, 600);
    const appVisible = await page.locator('[data-testid="statement-screen"]').isVisible();
    const sheetVisible = await page.locator('.ub-print-sheet').isVisible();
    /* jsdom applies no stylesheet, so this is the only place the `@media print`
       rules can be checked at all. Both halves matter: a sheet that does not
       appear prints a blank page, and an app chrome that does not disappear
       prints the sidebar. */
    record(
      'printing hides the application and shows the sheet',
      sheetVisible && !appVisible,
      `sheet ${sheetVisible ? 'shown' : 'MISSING'}, app ${appVisible ? 'STILL SHOWN' : 'hidden'}`
    );
    const sheet = await page.locator('.ub-print-sheet').innerText();
    record(
      'and the sheet carries the shop, the customer and the closing balance',
      sheet.includes('Kumar Stores') &&
        sheet.includes('Ramesh Traders') &&
        sheet.includes('2,500.00'),
      sheet.split('\n').filter(Boolean).slice(0, 4).join(' | ')
    );
    await page.emulateMedia({ media: 'screen' });
    await page.close();
  }

  await ctx.close();
}

/**
 * A staff account in the owner's tenant, signed in.
 *
 * Through `POST /members`, which is the product's own path (DEC-012): the server
 * mints a temporary password and returns it once, because nothing is emailed.
 */
const staffSession = async (token) => {
  const made = await must(
    'POST',
    '/members',
    { email: STAFF.email, full_name: 'Counter Person', role: 'staff' },
    token,
    { 'Idempotency-Key': `staff-${stamp}` }
  );
  const issued = made.body.data.password;
  const first = await must('POST', '/auth/login', { email: STAFF.email, password: issued });
  await must(
    'POST',
    '/auth/password/set',
    { current_password: issued, new_password: STAFF.password },
    first.body.data.access_token
  );
  const scoped = await must('POST', '/auth/login', {
    email: STAFF.email,
    password: STAFF.password,
  });
  return scoped.body.data.access_token;
};

async function run() {
  const { token, parties } = await seed();

  const browser = await chromium.launch();
  await checks(browser, token, parties);

  if (wantShots) {
    for (const size of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await sweep(ctx, size, parties);
      await ctx.close();
    }
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.check}${r.detail ? `\n        ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (wantShots) {
    mkdirSync(SHOT_DIR, { recursive: true });
    writeFileSync(`${SHOT_DIR}/index.json`, JSON.stringify(shots, null, 2));
    console.log(`\n${shots.length} screenshots in ${SHOT_DIR}`);
    if (missed.length > 0) {
      console.log(`\n${missed.length} captures did not happen:`);
      for (const miss of missed) console.log(`  - ${miss}`);
    }
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
