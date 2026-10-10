// Shop P0 — purchase returns (debit notes) on a live stack.
//
// Seeds a shop with a supplier and a recorded bill of 20 rice through the API, then at
// 1280 and 390 px:
//   * opens the bill, taps "Return goods", types 3 bags with a reason and issues it —
//     it must land on the debit note, numbered DN/…, against that bill;
//   * the bill then lists the note and asks 3 bags less;
//   * a second return refuses more than is left, then a price correction moves nothing;
//   * voids the first note from its page with a reason;
//   * checks the debit notes list.
// Then, through the API: stock went down only by the standing return, and the supplier's
// khata equals the bill less the standing notes.
// Every screen is measured and photographed into /tmp/e2e-shots/returns.
//
//   node e2e/returns.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/returns';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `returnsqa-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Returns QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Traders', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const nos = (await must('GET', '/units', null, tok)).find((u) => u.code === 'NOS');
const rice = await must('POST', '/items', {
  name: 'Basmati Rice 5kg', unit_id: nos.id, selling_price: '450.00', purchase_price: '300.00', tax_code: 'GST5',
}, tok);
const agro = await must('POST', '/parties', { name: 'Agro Wholesale', is_supplier: true, is_customer: false, state_code: '27' }, tok);
const recordedBill = async (qty, number) => {
  const d = await api('POST', '/purchases/bills', {
    party_id: agro.id, document_date: TODAY, supplier_invoice_number: number,
    lines: [{ item_id: rice.id, qty, unit_cost: '300.00' }],
  }, tok);
  if (d.status >= 300) throw new Error(`bill ${d.status} ${JSON.stringify(d.body).slice(0, 300)}`);
  const r = await api('POST', `/purchases/bills/${d.body.data.id}/record`, { version: d.body.data.version }, tok, { 'Idempotency-Key': `${uniq()}` });
  if (r.status >= 300) throw new Error(`record ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.data;
};

// ── The screens ─────────────────────────────────────────────────────────────
const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  cut: Array.from((document.querySelector('main') ?? document).querySelectorAll('p, span, div, h1, h2, h3'))
    .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
    .filter((node) => !node.className.toString().includes('sr-only'))
    .filter((node) => node.scrollWidth - node.clientWidth > 1)
    .map((node) => (node.textContent ?? '').trim())
    .slice(0, 6),
}));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const bills = [];
for (const [size, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  const bill = await recordedBill('20', `AW/${uniq()}`.slice(0, 20));
  bills.push(bill);
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (res) => {
    const probe = /\/auth\/(me|refresh)$/.test(new URL(res.url()).pathname);
    if (res.status() >= 400 && res.url().includes('/api/') && !probe) bad.push(`${res.status()} ${res.url().replace(/.*\/api\/v1/, '')}`);
  });
  const look = async (name, scope = 'main') => {
    await page.waitForTimeout(1500);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: scope === 'main' });
  };
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  // Return 3 from the bill.
  await page.goto(`${FE}/purchases/bills/${bill.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('purchase-return').waitFor({ timeout: 20000 });
  await page.getByTestId('purchase-return').click();
  const qty = page.getByLabel('Quantity of Basmati Rice 5kg to return');
  await qty.waitFor({ timeout: 20000 });
  await qty.fill('3');
  await page.getByLabel('Reason').selectOption('damaged_goods');
  await page.getByPlaceholder(/note \(optional\)/i).fill('3 bags torn');
  await look('drawer', 'viewport');
  await page.getByTestId('debit-note-issue').click();
  await page.waitForURL((u) => /\/purchases\/debit-notes\/[^/]+$/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  check(`${size}: Issue lands on the debit note`, /\/purchases\/debit-notes\/[^/]+$/.test(new URL(page.url()).pathname), page.url());
  await page.getByTestId('debit-note-void').waitFor({ timeout: 20000 });
  const noteText = await page.locator('main').innerText();
  check(`${size}: numbered DN/ against the bill`, /DN\/\d\d-\d\d\/\d{4}/.test(noteText) && noteText.includes(bill.number), noteText.slice(0, 300));
  check(`${size}: the note says what it took off the bill`, noteText.includes('Taken off the bill') && noteText.includes('₹945.00'), '');
  await look('note');
  const noteId = new URL(page.url()).pathname.split('/').pop();

  // The bill lists the note and asks less.
  await page.goto(`${FE}/purchases/bills/${bill.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('purchase-debit-notes').waitFor({ timeout: 20000 });
  const billText = await page.locator('main').innerText();
  check(`${size}: the bill lists its note and less to pay`, billText.includes('Less debit notes') && billText.includes('₹5,355.00'), billText.slice(-400));
  await look('bill-after');

  // More than is left is refused before the server; a price correction moves nothing.
  await page.getByTestId('purchase-return').click();
  await qty.waitFor({ timeout: 20000 });
  check(`${size}: the drawer says 17 are left`, (await page.locator('[data-testid="debit-note-lines"]').innerText()).includes('can return 17'), '');
  await qty.fill('18');
  check(`${size}: 18 cannot be issued`, await page.getByTestId('debit-note-issue').isDisabled(), '');
  await qty.fill('1');
  await page.getByLabel('Reason').selectOption('rate_correction');
  await page.getByText('Goods are going back').click();
  await page.getByTestId('debit-note-issue').click();
  await page.waitForURL((u) => /\/purchases\/debit-notes\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith(noteId), { timeout: 20000 }).catch(() => {});
  await page.getByTestId('debit-note-void').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  const correction = await page.locator('main').innerText();
  check(`${size}: a price correction says no goods moved`, correction.includes('no goods moved'), correction.slice(0, 300));

  // Void the first note.
  await page.goto(`${FE}/purchases/debit-notes/${noteId}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('debit-note-void').click();
  await page.getByRole('dialog').getByRole('textbox').fill('Supplier refused the return');
  await look('void-dialog', 'viewport');
  await page.getByTestId('debit-note-void-confirm').click();
  await page.waitForTimeout(2000);
  const voided = await api('GET', `/purchases/debit-notes/${noteId}`, null, tok);
  check(`${size}: the note is void`, voided.body.data.status === 'void', voided.body.data.status);

  await page.goto(`${FE}/purchases/debit-notes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const list = await page.locator('main').innerText();
  check(`${size}: the list shows the notes`, /DN\/\d\d-\d\d\/\d{4}/.test(list), list.slice(0, 300));
  await look('list');
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  check(`${size}: no failed requests`, bad.length === 0, bad.join(' | '));
  await ctx.close();
}
await browser.close();

// ── The books ───────────────────────────────────────────────────────────────
const item = await must('GET', `/items/${rice.id}`, null, tok);
check('stock: 40 bought, every return voided or a correction', Number(item.on_hand) === 40, item.on_hand);
const supplier = await must('GET', `/parties/${agro.id}`, null, tok);
// Each bill 6,300 (20 × 300 + 5 %); each pass leaves one correction of 315 standing.
check('the khata is the bills less the standing corrections', Number(supplier.balance) === -(2 * 6300 - 2 * 315), supplier.balance);
for (const bill of bills) {
  const after = await must('GET', `/purchases/bills/${bill.id}`, null, tok);
  check(`${bill.number}: due is the bill less its correction`, after.amount_due === '5985.00', after.amount_due);
}
writeFileSync(`${ROOT}/account.json`, JSON.stringify({ email }, null, 1));
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
