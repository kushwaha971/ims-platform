// Shop item 1 — the profit report against a live stack.
//
// Seeds a GST shop through the API with figures a person can check by hand,
// asserts the report's numbers against them, then walks /reports/profit at
// 1280 and 390 px: every view, losses first, a search, a row that opens, the
// hub row, and a staff member who must not see it. Every screen is measured
// (page wider than the viewport, a text node cut by its own box) and
// photographed into /tmp/e2e-shots/profit.
//
//   node e2e/profit.mjs
//
// The book (taxable values; costs are the opening stock's unit cost):
//   Ramesh  rice 2 × 450 = 900 (cost 600)   oil 2 × 180 = 360 (cost 400, a loss)
//   Walk-in rice 1 × 450 = 450 (cost 300)
//   Gupta   rice 4 × 450 = 1800, one returned → 1350 (cost 900); delivery 50, no cost
//   Expense 500
// So: rice 2700 / 1800 / +900; oil 360 / 400 / −40; sales 3110, cost 2200,
// gross profit 860 (28.1% of the 3060 that has a cost), net 360.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/profit';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed) => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `27${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => {
    const p = B36.indexOf(ch) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  });
  return body + B36[(36 - (sum % 36)) % 36];
};
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `profitqa-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Profit QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Kirana', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const stamp = Date.now();
await must('PATCH', '/tenants/current', {
  gst_type: 'regular',
  gstin: gstinFor(stamp),
  address: { line1: '4 Station Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
}, tok);
const nos = (await must('GET', '/units', null, tok)).find((u) => u.code === 'NOS');
const mkItem = (name, price, cost, stock, extra = {}) => must('POST', '/items', {
  name, unit_id: nos.id, selling_price: price, tax_code: 'GST5', hsn_sac: '1006',
  ...(cost ? { purchase_price: cost, opening_stock: { qty: stock, unit_cost: cost } } : {}),
  ...extra,
}, tok);
const rice = await mkItem('Basmati Rice 5kg', '450.00', '300.00', '40');
const oil = await mkItem('Mustard Oil 1L', '180.00', '200.00', '20');
const delivery = await mkItem('Home delivery', '50.00', null, null, { item_type: 'service', tax_code: 'GST18', hsn_sac: '9968' });
const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27' }, tok);
const gupta = await must('POST', '/parties', { name: 'Gupta Provision Store', is_customer: true, state_code: '27' }, tok);

const inv = async (body, payment) => {
  const r = await api('POST', '/sales/invoices?issue=true', { ...body, ...(payment ? { payment } : {}) }, tok);
  if (r.status >= 400) throw new Error(`invoice ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  return r.body.data;
};
const line = (item, qty) => ({ item_id: item.id, qty: String(qty) });
await inv({ party_id: ramesh.id, document_date: TODAY, due_on: TODAY, lines: [line(rice, 2), line(oil, 2)] });
await inv({ walk_in_name: 'Walk-in', document_date: TODAY, lines: [line(rice, 1)] },
  { payment_date: TODAY, mode_breakup: [{ mode: 'cash', amount: '473.00' }] });
const big = await inv({ party_id: gupta.id, document_date: TODAY, due_on: TODAY, lines: [line(rice, 4), line(delivery, 1)] });
const riceLine = big.lines.find((l) => l.item_id === rice.id);
let r = await api('POST', '/sales/credit-notes', {
  against_id: big.id, party_id: gupta.id, document_date: TODAY, reason: 'sales_return', restock: true,
  lines: [{ item_id: rice.id, qty: '1', against_line_id: riceLine.id }],
}, tok);
check('seed: credit note draft', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 300)}`);
r = await api('POST', `/sales/credit-notes/${r.body.data.id}/issue`, {}, tok);
check('seed: credit note issued', r.status < 300, `${r.status}`);
const cats = await must('GET', '/expense-categories', null, tok);
r = await api('POST', '/expenses', { amount: '500', category_id: cats[0].id, expense_date: TODAY, mode: 'cash', note: 'Shop rent share' }, tok);
check('seed: expense 500', r.status < 300, `${r.status}`);

// ── The figures, through the API ───────────────────────────────────────────
const report = async (query) => {
  const got = await api('GET', `/reports/profit?date_from=${TODAY}&date_to=${TODAY}&${query}`, null, tok);
  return got.body;
};
const byItem = await report('group=item');
const items = Object.fromEntries(byItem.data.map((row) => [row.name, row]));
check('rice: what stayed sold, at its frozen cost', items['Basmati Rice 5kg']?.sale_value === '2700.00' && items['Basmati Rice 5kg']?.profit === '900.00', JSON.stringify(items['Basmati Rice 5kg']));
check('oil: sold below cost is a loss', items['Mustard Oil 1L']?.profit === '-40.00', items['Mustard Oil 1L']?.profit);
check('delivery: no cost, so no invented profit', items['Home delivery']?.uncosted_lines === 1 && items['Home delivery']?.margin_pct === null, JSON.stringify(items['Home delivery']));
const t = byItem.meta.totals;
check('P&L: sales, cost, gross, margin, expenses, net', t.sale_value === '3110.00' && t.cost === '2200.00' && t.profit === '860.00' && t.margin_pct === '28.1' && t.expenses === '500.00' && t.net_profit === '360.00', JSON.stringify(t));
const byParty = await report('group=party');
check('by customer: walk-in sales are one row', byParty.data.some((row) => row.id === null && row.profit === '150.00'), JSON.stringify(byParty.data.map((row) => [row.name, row.profit])));
const losses = await report('group=item&ordering=profit');
check('losses first', losses.data[0]?.name === 'Mustard Oil 1L', losses.data[0]?.name);

const staffEmail = `profitqa-staff-${uniq()}@e2e.test`;
const made = await must('POST', '/members', { full_name: 'Counter Staff', email: staffEmail, role: 'staff' }, tok);
let st = (await must('POST', '/auth/login', { email: staffEmail, password: made.password })).access_token;
await must('POST', '/auth/password/set', { current_password: made.password, new_password: PASSWORD }, st);
st = (await must('POST', '/auth/login', { email: staffEmail, password: PASSWORD })).access_token;
const refused = await api('GET', '/reports/profit', null, st);
check('staff are refused by the server', refused.status === 403, `${refused.status}`);

// ── The screen ──────────────────────────────────────────────────────────────
// The house check (ledger.mjs): a leaf whose text overflows its own box is a word
// a merchant cannot finish reading; `sr-only` is clipped by design and excluded.
const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  // Inside the page: the shell's business name truncates with an ellipsis by design.
  cut: Array.from((document.querySelector('main') ?? document).querySelectorAll('p, span, div, h1, h2, h3'))
    .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
    .filter((node) => !node.className.toString().includes('sr-only'))
    .filter((node) => node.scrollWidth - node.clientWidth > 1)
    .map((node) => (node.textContent ?? '').trim())
    .slice(0, 6),
}));

// PW_CHROMIUM: a Chromium already on the machine, when the pinned one is not installed.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
async function signIn(viewport, who) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (res) => {
    const probe = /\/auth\/(me|refresh)$/.test(new URL(res.url()).pathname);
    if (res.status() >= 400 && res.url().includes('/api/') && !probe) bad.push(`${res.status()} ${res.url().replace(/.*\/api\/v1/, '')}`);
  });
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', who);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors, bad };
}

for (const [size, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  const { ctx, page, errors, bad } = await signIn(viewport, email);
  const look = async (name, path) => {
    if (path) await page.goto(`${FE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };
  await look('hub', '/reports');
  check(`${size}: the hub lists the report`, await page.getByText('Profit and loss').first().isVisible());
  await page.evaluate(() => localStorage.setItem('ub.statSummary.profit', 'open'));
  await look('by-item', '/reports/profit');
  const text = await page.locator('main').innerText();
  check(`${size}: the P&L is on top`, text.includes('₹860.00') && text.includes('₹360.00') && text.includes('Net profit'), '');
  check(`${size}: the uncosted line is owned up to`, text.includes('1 line has no cost recorded'));
  await look('by-customer', '/reports/profit?by=party');
  await look('by-category', '/reports/profit?by=category');
  await look('by-bill', '/reports/profit?by=bill');
  await look('losses-first', '/reports/profit?sort=profit');
  const first = await page.locator('main').innerText();
  check(`${size}: losses first puts the oil on top`, first.indexOf('Mustard Oil 1L') > -1 && first.indexOf('Mustard Oil 1L') < first.indexOf('Basmati Rice 5kg'));
  await page.goto(`${FE}/reports/profit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.getByRole('searchbox').fill('oil');
  await page.waitForTimeout(1500);
  check(`${size}: search narrows the list`, page.url().includes('q=oil'), page.url());
  await look('searched');
  await page.getByText('Mustard Oil 1L').first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/items/'), { timeout: 15000 }).catch(() => {});
  check(`${size}: a row opens the item`, new URL(page.url()).pathname === `/items/${oil.id}`, page.url());
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  check(`${size}: no failed requests`, bad.length === 0, bad.join(' | '));
  await ctx.close();
}

const staff = await signIn({ width: 390, height: 844 }, staffEmail);
await staff.page.goto(`${FE}/reports/profit`, { waitUntil: 'domcontentloaded' });
await staff.page.waitForTimeout(2500);
check('staff see why, not a broken page', (await staff.page.locator('main').innerText()).includes('Profit is for the owner and the accountant'));
await staff.page.screenshot({ path: `${ROOT}/phone-staff.png`, fullPage: true });
await staff.ctx.close();
await browser.close();

writeFileSync(`${ROOT}/accounts.json`, JSON.stringify({ email, staffEmail }, null, 1));
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
