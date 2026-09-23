/**
 * look.mjs — a design-review sweep, not a test. Seeds a book, signs in, and
 * screenshots the main screens at a phone and a desktop width into
 * $E2E_SHOTS (default /tmp/claude-0/look) so a layout change can be looked at
 * before it is described. No assertions: the harnesses beside it assert.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/claude-0/look';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

const stamp = Date.now();
const OWNER = { email: `look-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };
const STAFF = { email: `look-staff-${stamp}@shop.test`, password: 'Dukaan2026x' };

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
    { 'Idempotency-Key': `look-${stamp}-${partyId}-${index}` }
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
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.fill('input[type="email"], input[name="email"]', who.email);
  await page.fill('input[type="password"], input[name="password"]', who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
  await page.waitForTimeout(3000);
};

const openStatement = async (page, party, query = '') => {
  await page.goto(`${FRONTEND}/parties/${party.id}/statement${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  await page.waitForSelector('[data-testid="statement-screen"]', { timeout: 180000 });
  await settle(page, 1400);
};

/** The on-screen half. The print sheet is in the DOM too — see the page. */
const screenText = (page) => page.locator('[data-testid="statement-screen"]').innerText();


const SIZES2 = [
  { id: 'phone', width: 390, height: 844 },
  { id: 'desktop', width: 1440, height: 1000 },
];
const main = async () => {
  const { parties } = await seed();
  // Aging needs age: an old debt for Ramesh.
  const browser = await chromium.launch();
  for (const size of SIZES2) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    await signIn(page);
    const go = async (path, name, sel) => {
      await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      if (sel) await page.waitForSelector(sel, { timeout: 60000 }).catch(() => {});
      await settle(page, 1800);
      mkdirSync(`${SHOT_DIR}/${size.id}`, { recursive: true });
      await page.screenshot({ path: `${SHOT_DIR}/${size.id}/${name}.png`, fullPage: process.argv.includes('--full') });
    };
    await go('/parties', 'parties', '[data-testid="ub-grid"]');
    await go(`/parties/${parties.passbook.id}`, 'khata');
    await go(`/parties/${parties.passbook.id}/statement`, 'statement', '[data-testid="statement-screen"]');
    await go('/ledger/aging', 'aging', '[data-testid="aging-screen"]');
    await go('/parties/tags', 'tags');
    await go('/settings/team', 'team');
    await context.close();
  }
  await browser.close();
  console.log('DONE');
};
main().catch((e) => { console.error(e); process.exit(1); });
