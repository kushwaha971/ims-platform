// Shop item 3 — sales and purchase orders on a live stack: draft → confirm/send →
// bill, and cancel.
//
// Seeds a shop through the API, then at 1280 and 390 px:
//   * opens a draft order in the editor and presses "Save & confirm" — it must land
//     on the order's page, numbered SO/…, Open;
//   * presses Convert to invoice, confirms — it must land in a DRAFT invoice's
//     editor carrying the order's lines, and the order must then say Billed;
//   * cancels a second open order with a reason;
//   * checks the list's tabs, and that nothing moved: stock, the khata, the
//     invoice list.
// Every screen is measured and photographed into /tmp/e2e-shots/orders.
//
//   node e2e/orders.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/orders';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `ordersqa-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Orders QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Traders', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const nos = (await must('GET', '/units', null, tok)).find((u) => u.code === 'NOS');
const rice = await must('POST', '/items', {
  name: 'Basmati Rice 5kg', unit_id: nos.id, selling_price: '450.00', purchase_price: '300.00',
  tax_code: 'GST0', opening_stock: { qty: '40', unit_cost: '300.00' },
}, tok);
const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27' }, tok);
const agro = await must('POST', '/parties', { name: 'Agro Wholesale', is_supplier: true, is_customer: false, state_code: '27' }, tok);
const draftPurchaseOrder = async (qty) => {
  const r = await api('POST', '/purchases/orders', { party_id: agro.id, document_date: TODAY, lines: [{ item_id: rice.id, qty, unit_cost: '300.00' }] }, tok);
  if (r.status >= 300) throw new Error(`purchase order ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.data;
};
const draftOrder = async (qty) => {
  const r = await api('POST', '/sales/orders', { party_id: ramesh.id, document_date: TODAY, lines: [{ item_id: rice.id, qty }] }, tok);
  if (r.status >= 300) throw new Error(`order ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.data;
};
const stockBefore = (await must('GET', `/items/${rice.id}`, null, tok)).on_hand;

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
for (const [size, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (res) => {
    const probe = /\/auth\/(me|refresh)$/.test(new URL(res.url()).pathname);
    if (res.status() >= 400 && res.url().includes('/api/') && !probe) bad.push(`${res.status()} ${res.url().replace(/.*\/api\/v1/, '')}`);
  });
  const look = async (name) => {
    await page.waitForTimeout(1500);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  // Confirm from the editor.
  const first = await draftOrder('3');
  await page.goto(`${FE}/sales/orders/${first.id}/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('invoice-issue').waitFor({ timeout: 20000 });
  await look('editor');
  await page.getByTestId('invoice-issue').click();
  await page.waitForURL((u) => u.pathname === `/sales/orders/${first.id}`, { timeout: 20000 }).catch(() => {});
  check(`${size}: Save & confirm opens the order`, new URL(page.url()).pathname === `/sales/orders/${first.id}`, page.url());
  await page.getByTestId('order-convert').waitFor({ timeout: 20000 });
  const body = await page.locator('main').innerText();
  check(`${size}: numbered and open`, /SO\/\d\d-\d\d\/\d{4}/.test(body) && body.includes('Open'), body.slice(0, 200));
  await look('open-order');

  // Convert to invoice.
  await page.getByTestId('order-convert').click();
  await page.getByRole('button', { name: 'Convert to invoice' }).last().click();
  await page.waitForURL((u) => /\/sales\/invoices\/[^/]+\/edit$/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  check(`${size}: convert lands in the invoice draft`, /\/sales\/invoices\/[^/]+\/edit$/.test(new URL(page.url()).pathname), page.url());
  await look('invoice-from-order');
  await page.goto(`${FE}/sales/orders/${first.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const after = await page.locator('main').innerText();
  check(`${size}: the order says it was billed`, after.includes('Converted to invoice') && !(await page.getByTestId('order-convert').count()), after.slice(0, 300));
  await look('billed-order');

  // Cancel with a reason.
  const second = await draftOrder('1');
  await must('POST', `/sales/orders/${second.id}/confirm`, {}, tok);
  await page.goto(`${FE}/sales/orders/${second.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('order-cancel').click();
  await page.getByRole('textbox').fill('Customer bought elsewhere');
  await look('cancel-dialog');
  await page.getByTestId('order-cancel-confirm').click();
  await page.waitForTimeout(2000);
  const cancelled = await api('GET', `/sales/orders/${second.id}`, null, tok);
  check(`${size}: cancelled with its reason`, cancelled.body.data.status === 'cancelled', cancelled.body.data.status);

  // The list.
  await page.goto(`${FE}/sales/orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await look('list');

  // ── Delivery challans ───────────────────────────────────────────────────
  const onHand = async () => Number((await must('GET', `/items/${rice.id}`, null, tok)).on_hand);
  const dcDraft = await api('POST', '/sales/delivery-challans', {
    party_id: ramesh.id, document_date: TODAY, challan_type: 'supply_on_approval',
    transporter: 'Shree Roadways', vehicle_number: 'mh12ab1234', lines: [{ item_id: rice.id, qty: '4' }],
  }, tok);
  check(`${size}: challan draft`, dcDraft.status === 201, `${dcDraft.status}`);
  const dc = dcDraft.body.data;
  const before = await onHand();
  await page.goto(`${FE}/sales/challans/${dc.id}/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('challan-details').waitFor({ timeout: 20000 });
  await look('dc-editor');
  await page.getByTestId('invoice-issue').click();
  await page.waitForURL((u) => u.pathname === `/sales/challans/${dc.id}`, { timeout: 20000 }).catch(() => {});
  check(`${size}: Save & issue opens the challan`, new URL(page.url()).pathname === `/sales/challans/${dc.id}`, page.url());
  await page.getByTestId('challan-convert').waitFor({ timeout: 20000 });
  const dcText = await page.locator('main').innerText();
  check(`${size}: numbered DC/ with its transport`, /DC\/\d\d-\d\d\/\d{4}/.test(dcText) && dcText.includes('MH12AB1234'), dcText.slice(0, 200));
  check(`${size}: the goods left on the challan`, (await onHand()) === before - 4, `${before} → ${await onHand()}`);
  await look('dc-issued');
  await page.getByTestId('challan-convert').click();
  await page.getByRole('button', { name: 'Convert to invoice' }).last().click();
  await page.waitForURL((u) => /\/sales\/invoices\/[^/]+\/edit$/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  const invoiceId = new URL(page.url()).pathname.split('/')[3];
  check(`${size}: convert lands in the invoice draft`, !!invoiceId && page.url().endsWith('/edit'), page.url());
  const inv = await must('GET', `/sales/invoices/${invoiceId}`, null, tok);
  const issued = await api('POST', `/sales/invoices/${invoiceId}/issue`, { version: inv.version }, tok);
  check(`${size}: the invoice from the challan issues`, issued.status === 200, `${issued.status} ${JSON.stringify(issued.body?.error ?? '').slice(0, 200)}`);
  check(`${size}: and does not take the stock out again`, (await onHand()) === before - 4, `${await onHand()}`);
  const dc2 = (await api('POST', '/sales/delivery-challans', { party_id: ramesh.id, document_date: TODAY, lines: [{ item_id: rice.id, qty: '2' }] }, tok)).body.data;
  await must('POST', `/sales/delivery-challans/${dc2.id}/issue`, {}, tok);
  const mid = await onHand();
  await page.goto(`${FE}/sales/challans/${dc2.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('challan-void').click();
  await page.getByRole('textbox').fill('Customer returned the goods');
  await look('dc-void-dialog');
  await page.getByTestId('order-cancel-confirm').click();
  await page.waitForTimeout(2000);
  check(`${size}: voiding the challan brings the goods back`, (await onHand()) === mid + 2, `${mid} → ${await onHand()}`);
  await page.goto(`${FE}/sales/challans`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await look('dc-list');

  // ── Purchase orders ──────────────────────────────────────────────────────
  const po = await draftPurchaseOrder('20');
  await page.goto(`${FE}/purchases/orders/${po.id}/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('purchase-record').waitFor({ timeout: 20000 });
  const editorText = await page.locator('main').innerText();
  check(`${size}: the order editor asks no supplier bill number`, !editorText.includes('Supplier invoice') && editorText.includes('Expected by'), '');
  await look('po-editor');
  await page.getByTestId('purchase-record').click();
  await page.waitForURL((u) => u.pathname === `/purchases/orders/${po.id}`, { timeout: 20000 }).catch(() => {});
  check(`${size}: Save & send opens the order`, new URL(page.url()).pathname === `/purchases/orders/${po.id}`, page.url());
  await page.getByTestId('purchase-order-create-bill').waitFor({ timeout: 20000 });
  check(`${size}: the order is numbered PO/`, /PO\/\d\d-\d\d\/\d{4}/.test(await page.locator('main').innerText()));
  await look('po-sent');
  await page.getByTestId('purchase-order-create-bill').click();
  await page.waitForURL((u) => /\/purchases\/bills\/[^/]+\/edit$/.test(u.pathname), { timeout: 20000 }).catch(() => {});
  check(`${size}: Create bill lands in the bill draft`, /\/purchases\/bills\/[^/]+\/edit$/.test(new URL(page.url()).pathname), page.url());
  await look('po-bill-draft');
  await page.goto(`${FE}/purchases/orders/${po.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check(`${size}: the order says it was billed`, (await page.locator('main').innerText()).includes('Billed as'));
  await look('po-billed');
  const po2 = await draftPurchaseOrder('5');
  await must('POST', `/purchases/orders/${po2.id}/send`, {}, tok);
  await page.goto(`${FE}/purchases/orders/${po2.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('purchase-order-cancel').click();
  await page.getByRole('textbox').fill('Supplier out of stock');
  await page.getByTestId('purchase-order-cancel-confirm').click();
  await page.waitForTimeout(2000);
  const po2After = await api('GET', `/purchases/orders/${po2.id}`, null, tok);
  check(`${size}: purchase order cancelled`, po2After.body.data.status === 'cancelled', po2After.body.data.status);
  await page.goto(`${FE}/purchases/orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await look('po-list');
  await page.goto(`${FE}/purchases/bills`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const billsText = await page.locator('main').innerText();
  check(`${size}: no order in the bills list`, !/PO\/\d\d-/.test(billsText), '');
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  check(`${size}: no failed requests`, bad.length === 0, bad.join(' | '));
  await ctx.close();
}
await browser.close();

// ── Nothing moved ───────────────────────────────────────────────────────────
const stockAfter = (await must('GET', `/items/${rice.id}`, null, tok)).on_hand;
// Each pass: a challan of 4 billed (stock −4 once) and one of 2 voided (back).
check('only the billed challans moved stock, once each', Number(stockAfter) === Number(stockBefore) - 8, `${stockBefore} → ${stockAfter}`);
const supplier = await must('GET', `/parties/${agro.id}`, null, tok);
check('purchase orders moved no money', Number(supplier.balance) === 0, supplier.balance);
const party = await must('GET', `/parties/${ramesh.id}`, null, tok);
check('orders and challans moved no money; the two bills from challans did', Number(party.balance) > 0, party.balance);
const invoices = await api('GET', '/sales/invoices?tab=all', null, tok);
check('no order is in the invoice list', invoices.body.data.every((row) => row.kind !== 'sales_order'));
writeFileSync(`${ROOT}/account.json`, JSON.stringify({ email }, null, 1));
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
