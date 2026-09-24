/**
 * expenses.mjs — EXP-01 / EXP-02 / EXP-03 against a LIVE stack.
 *
 *   node e2e/expenses.mjs            # API + browser checks
 *   node e2e/expenses.mjs --shots    # also sweep the screens at four widths
 *
 * Env: E2E_FRONTEND (default http://localhost:3000), E2E_BACKEND (default
 * http://localhost:8000/api/v1), E2E_SHOTS (default /tmp/e2e-shots/expenses).
 *
 * Asserts the NETWORK and the numbers, not the controls — PTY-02's chips lit
 * up while issuing no request at all, and a cashbook that looks right with the
 * wrong closing is the worst defect this feature can ship. The width check
 * MEASURES (`scrollWidth` against the viewport) because an accessible name is
 * the full string whatever the pixels do.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots/expenses';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${check}${detail ? ` — ${detail}` : ''}`);
};

const stamp = Date.now();
const OWNER = { email: `exp-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };

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
  const payload = await response.json().catch(() => null);
  return { status: response.status, body: payload };
};
const must = async (...args) => {
  const response = await api(...args);
  if (response.status >= 400) {
    throw new Error(`${args[0]} ${args[1]} ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
};
const key = (label) => ({ 'Idempotency-Key': `exp-${stamp}-${label}` });
const today = () => new Date().toISOString().slice(0, 10);

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
    key('tenant')
  );
  const scoped = await must('POST', '/auth/login', { email: OWNER.email, password: OWNER.password });
  const token = scoped.body.data.access_token;
  /* Finish the wizard. The seeded categories are written by `apply_preset`
     when onboarding COMPLETES, not when the tenant is created — a harness that
     stopped at POST /tenants (as look.mjs does) would test a book no merchant
     ever has: one with no categories at all. */
  for (const step of [2, 3, 4]) {
    await must('PATCH', '/tenants/current', { onboarding_step: step }, token);
  }
  const party = await must(
    'POST',
    '/parties',
    { name: 'Landlord Sharma', is_supplier: true, is_customer: false, mobile: null },
    token,
    key('party')
  );
  return { token, landlordId: party.body.data.id };
}

async function apiChecks({ token, landlordId }) {
  const cats = await must('GET', '/expense-categories', null, token);
  const byCode = Object.fromEntries(cats.body.data.map((c) => [c.system_code, c]));
  record('nine seeded categories with colours', cats.body.data.length >= 9 && cats.body.data.every((c) => c.color));

  const day = today();
  const tea = await must(
    'POST',
    '/expenses',
    { amount: '120', category_id: byCode.food.id, expense_date: day, mode: 'cash', note: 'Tea for staff' },
    token,
    key('tea')
  );
  record('paid expense numbered', /^EXP\/\d\d-\d\d\/0001$/.test(tea.body.data.number), tea.body.data.number);
  const replay = await api(
    'POST',
    '/expenses',
    { amount: '120', category_id: byCode.food.id, expense_date: day, mode: 'cash', note: 'Tea for staff' },
    token,
    key('tea')
  );
  record('retry replays the same expense', replay.body?.data?.id === tea.body.data.id);

  await must(
    'POST',
    '/expenses',
    { amount: '450', category_id: byCode.transport.id, expense_date: day, mode: 'upi', upi_app: 'phonepe' },
    token,
    key('auto')
  );
  const rent = await must(
    'POST',
    '/expenses',
    {
      amount: '12000',
      category_id: byCode.rent.id,
      expense_date: day,
      paid: false,
      party_id: landlordId,
      due_on: day,
    },
    token,
    key('rent')
  );
  record('unpaid rent moves the landlord balance', rent.body.meta?.party_balance === '-12000.00', rent.body.meta?.party_balance);

  const book = await must('GET', `/cashbook?date_from=${day}&date_to=${day}`, null, token);
  const out = book.body.data.range.out;
  record('cashbook out = paid expenses only', out.cash === '120.00' && out.bank === '450.00', JSON.stringify(out));

  await must('POST', `/expenses/${tea.body.data.id}/void`, { reason: 'Typed twice' }, token, key('void-tea'));
  const after = await must('GET', `/cashbook?date_from=${day}&date_to=${day}`, null, token);
  record('void removes it from the cashbook', after.body.data.range.out.cash === '0.00');

  await must('POST', `/expenses/${rent.body.data.id}/void`, { reason: 'Landlord waived it' }, token, key('void-rent'));
  const landlord = await must('GET', `/parties/${landlordId}`, null, token);
  record('void of unpaid rent returns the balance to zero', landlord.body.data.balance === '0.00', landlord.body.data.balance);

  // Leave a live, varied book behind for the screens.
  await must('POST', '/expenses', { amount: '5000', category_id: byCode.salaries.id, expense_date: day, mode: 'bank', note: 'Helper salary' }, token, key('sal'));
  await must('POST', '/expenses', { amount: '80', category_id: byCode.food.id, expense_date: day, mode: 'cash' }, token, key('tea2'));
  await must('POST', '/expenses', { amount: '15000', category_id: byCode.rent.id, expense_date: day, paid: false, party_id: landlordId, due_on: day, note: 'October rent' }, token, key('rent2'));
  await must('POST', `/parties/${landlordId}/ledger-entries`, { direction: 'credit', amount: '2000.00', entry_date: day, payment_mode: 'cash', note: 'Advance returned' }, token, key('got'));
}

const signIn = async (page) => {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"], input[name="email"]', OWNER.email);
  await page.fill('input[type="password"], input[name="password"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
  await page.waitForTimeout(2000);
};

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
];

async function browserChecks() {
  const browser = await chromium.launch();
  for (const size of wantShots ? SIZES : [SIZES[2]]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    const dir = `${SHOT_DIR}/${size.id}`;
    mkdirSync(dir, { recursive: true });
    await signIn(page);

    await page.goto(`${FRONTEND}/expenses`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('[data-testid="expenses-screen"]', { timeout: 120000 });
    await page.waitForTimeout(2500);
    const text = await page.locator('[data-testid="expenses-screen"]').innerText();
    record(`[${size.id}] list shows the salary row`, text.includes('Helper salary'));
    record(`[${size.id}] list page fits the viewport`, (await overflow(page)) <= 0, `${await overflow(page)}px`);
    if (wantShots) await page.screenshot({ path: `${dir}/list.png`, fullPage: true });

    // The Void tab asks the server for voids — the network, not the chip.
    const voidRequest = page.waitForRequest((r) => r.url().includes('/expenses?') && r.url().includes('status=void'), { timeout: 30000 }).then(() => true).catch(() => false);
    await page.getByRole('tab', { name: 'Void' }).click();
    record(`[${size.id}] Void tab sends status=void`, await voidRequest);
    await page.waitForTimeout(1500);
    if (wantShots) await page.screenshot({ path: `${dir}/list-void.png`, fullPage: true });
    await page.getByRole('tab', { name: 'All' }).click();
    await page.waitForTimeout(1500);

    // The drawer: opens clean (no red state before a touch), then records.
    await page.getByTestId('expense-add').click();
    await page.getByRole('dialog').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    const redOnOpen = await page.getByRole('dialog').getByText('Enter an amount').count();
    record(`[${size.id}] drawer opens without an error`, redOnOpen === 0);
    if (wantShots) await page.screenshot({ path: `${dir}/drawer.png` });
    await page.getByRole('dialog').getByRole('switch').click();
    await page.waitForTimeout(500);
    if (wantShots) await page.screenshot({ path: `${dir}/drawer-unpaid.png` });
    await page.getByRole('dialog').getByRole('switch').click();
    await page.getByLabel('Amount').fill(`${size.width}`);
    await page.getByRole('dialog').getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Electricity' }).click().catch(() => {});
    await page.waitForTimeout(300);
    const post = page.waitForResponse((r) => r.url().endsWith('/expenses') && r.request().method() === 'POST', { timeout: 30000 }).catch(() => null);
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    const response = await post;
    record(`[${size.id}] drawer save posts 201`, response?.status() === 201, String(response?.status()));
    await page.waitForTimeout(2000);

    // Detail sheet and void dialog.
    await page.getByRole('button', { name: /Open EXP/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    if (wantShots) await page.screenshot({ path: `${dir}/detail.png` });
    await page.keyboard.press('Escape');

    await page.goto(`${FRONTEND}/cashbook?period=today`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('[data-testid="cashbook-screen"]', { timeout: 120000 });
    await page.waitForTimeout(2500);
    const book = await page.locator('[data-testid="cashbook-screen"]').innerText();
    record(`[${size.id}] cashbook shows the close-the-day panel`, book.includes('Close the day'));
    record(`[${size.id}] cashbook fits the viewport`, (await overflow(page)) <= 0, `${await overflow(page)}px`);
    await page.getByLabel('Counted cash').fill('1000');
    await page.waitForTimeout(500);
    const verdict = await page.getByTestId('close-the-day').innerText();
    record(`[${size.id}] counted cash gives a verdict`, /Short by|Extra|Matches/.test(verdict), verdict.split('\n').pop());
    if (wantShots) await page.screenshot({ path: `${dir}/cashbook-today.png`, fullPage: true });
    await page.goto(`${FRONTEND}/cashbook`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('[data-testid="cashbook-screen"]', { timeout: 120000 });
    await page.waitForTimeout(2500);
    if (wantShots) await page.screenshot({ path: `${dir}/cashbook-month.png`, fullPage: true });
    await context.close();
  }
  await browser.close();
}

const main = async () => {
  const seeded = await seed();
  await apiChecks(seeded);
  await browserChecks();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
};
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
