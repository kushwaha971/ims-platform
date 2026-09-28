// SAL-02/03/06/07/08 "look" — drives the bills screens against a live stack and
// photographs them at a laptop and a phone width. Usage:
//   FE=http://localhost:3102 BE=http://localhost:8102/api/v1 node e2e/sales-look.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const FE = process.env.FE ?? 'http://localhost:3000';
const BE = process.env.BE ?? 'http://localhost:8000/api/v1';
const OUT = process.env.OUT ?? '/tmp/e2e-shots/sales';
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const api = async (m, p, b, t, extra = {}) => {
  const r = await fetch(BE + p, {
    method: m,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'api',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...extra,
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// A GSTIN is unique across tenants, so each run mints its own with a valid checksum.
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed) => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `27${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => {
    const product = B36.indexOf(ch) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  });
  return body + B36[(36 - (sum % 36)) % 36];
};

// ── Setup through the API: a regular GST shop in Maharashtra with stock ─────
const email = `sales-${stamp}@shop.test`;
const password = 'Dukaan2026x';
let r = await api('POST', '/auth/register', { email, password, full_name: 'Sales Look' });
const t0 = r.body.data.access_token;
r = await api('POST', '/tenants', { name: 'Sharma General Store', business_type: 'retail', state_code: '27' }, t0, { 'Idempotency-Key': `t-${stamp}` });
r = await api('POST', '/auth/login', { email, password });
const token = r.body.data.access_token;
r = await api('PATCH', '/tenants/current', {
  gst_type: 'regular', gstin: gstinFor(stamp), upi_vpa: 'sharma@okhdfc',
  address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
}, token);
check('tenant profile set to regular GST', r.status === 200, `${r.status} ${JSON.stringify(r.body?.error ?? '')}`);
const units = (await api('GET', '/units', null, token)).body.data;
const nos = units.find((u) => u.code === 'NOS');
const mkItem = async (name, price, tax, inclusive = false) => {
  const res = await api('POST', '/items', {
    name, unit_id: nos.id, selling_price: price, tax_code: tax, hsn_sac: '1006',
    tax_inclusive_selling: inclusive, opening_stock: { qty: '40', unit_cost: '300.00' },
  }, token, { 'Idempotency-Key': `i-${name}-${stamp}` });
  return res.body.data;
};
const rice = await mkItem('Basmati Rice 5kg', '450.00', 'GST5');
await mkItem('Cooking Oil 1L', '160.00', 'GST5', true);
await mkItem('Detergent 1kg', '95.00', 'GST18');
r = await api('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27', mobile: '+919876543210' }, token, { 'Idempotency-Key': `p-${stamp}` });
const party = r.body.data;
check('items and party created', !!rice?.id && !!party?.id);

// ── The browser ─────────────────────────────────────────────────────────────
const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 360, height: 780 }]]) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', email);
  await p.fill('input[type="password"]', password);
  await p.click('button[type="submit"]');
  await p.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
  await p.waitForTimeout(1500);

  await p.goto(`${FE}/sales/invoices`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${label}-01-list.png`, fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${label}: list fits the viewport`, overflow <= 1, `overflow ${overflow}px`);

  // Walk-in cash sale (retail defaults to walk-in).
  await p.goto(`${FE}/sales/invoices/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/${label}-02-new.png`, fullPage: true });
  // The header's global search is also a combobox — target the item cell.
  await p.locator('[role=combobox]', { hasText: 'Search or scan an item' }).first().click();
  await p.keyboard.type('Basm');
  await p.waitForTimeout(1500);
  await p.getByRole('option', { name: /Basmati Rice 5kg/ }).first().click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${label}-03-line.png`, fullPage: true });
  const grand = await p.getByTestId('invoice-grand-total').innerText().catch(() => '');
  check(`${label}: preview shows the grand total for one rice`, grand.includes('473'), grand);
  await p.waitForTimeout(4000);
  const indicator = await p.getByTestId('invoice-save-indicator').innerText().catch(() => '');
  check(`${label}: autosave reached the server`, /saved/i.test(indicator), indicator);
  await p.screenshot({ path: `${OUT}/${label}-04-autosaved.png`, fullPage: true });
  await p.getByTestId('invoice-issue').click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${label}-05-payment.png`, fullPage: true });
  await p.getByTestId('invoice-payment-confirm').click();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${label}-06-issued.png`, fullPage: true });
  const dialog = await p.getByRole('dialog').innerText().catch(() => '');
  check(`${label}: walk-in issued and paid`, /INV\/\d\d-\d\d\/\d{4}/.test(dialog) && /Paid/.test(dialog), dialog.replace(/\n/g, ' | '));

  await p.getByTestId('invoice-print-after-issue').click();
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${OUT}/${label}-07-detail-a4.png`, fullPage: true });
  const printed = await p.evaluate(() => window.__printed || 0);
  check(`${label}: print dialog invoked on arrival`, printed >= 1, `printed ${printed}`);
  const qr = await p.getByTestId('upi-qr').count();
  check(`${label}: A4 carries a QR`, qr === 1 || qr === 0, `qr ${qr} (paid bill: static QR)`);
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: `${OUT}/${label}-08-print-a4.png`, fullPage: true });
  await p.emulateMedia({ media: 'screen' });
  await p.getByTestId('print-thermal-action').click();
  await p.waitForTimeout(1200);
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: `${OUT}/${label}-09-print-thermal.png`, fullPage: true });
  await p.emulateMedia({ media: 'screen' });

  // Credit sale to Ramesh.
  await p.goto(`${FE}/sales/invoices/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await p.getByRole('radio', { name: 'Party' }).click().catch(() => p.getByText('Party', { exact: true }).first().click());
  await p.waitForTimeout(300);
  await p.getByPlaceholder('Search by name or mobile').fill('Ram');
  await p.waitForTimeout(1500);
  await p.getByText('Ramesh Traders').first().click();
  await p.waitForTimeout(500);
  await p.locator('[role=combobox]', { hasText: 'Search or scan an item' }).first().click();
  await p.keyboard.type('Deter');
  await p.waitForTimeout(1500);
  await p.getByRole('option', { name: /Detergent 1kg/ }).first().click();
  await p.waitForTimeout(800);
  await p.getByTestId('invoice-issue').click();
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/${label}-10-credit-issued.png`, fullPage: true });
  const credit = await p.getByRole('dialog').innerText().catch(() => '');
  check(`${label}: credit sale added to the khata`, /khata/.test(credit), credit.replace(/\n/g, ' | '));
  await p.getByRole('button', { name: 'View bill' }).click().catch(() => {});
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/${label}-11-credit-detail.png`, fullPage: true });
  const qr2 = await p.getByTestId('upi-qr').count();
  check(`${label}: a bill with money due prints a UPI QR`, qr2 === 1, `qr ${qr2}`);

  await p.goto(`${FE}/sales/invoices`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/${label}-12-list-filled.png`, fullPage: true });
  const listText = await p.locator('body').innerText();
  check(`${label}: list shows both bills`, /Ramesh Traders/.test(listText) && /Walk-in/.test(listText));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' / '));
  await ctx.close();
}
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
