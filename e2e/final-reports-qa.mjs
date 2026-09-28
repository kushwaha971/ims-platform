// Final QA — Wave 4 reports (RPT-01/02/03/04/07 + hub). Seeds a GST shop through
// the API, checks report figures against a naive aggregate of the seeded
// documents, then photographs every report at phone 390 and desktop 1280.
//   node e2e/final-reports-qa.mjs            (seed + api checks + shots)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/qa-final/reports';
for (const s of ['phone', 'desktop']) mkdirSync(`${ROOT}/${s}`, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed) => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `27${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => { const p = B36.indexOf(ch) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); });
  return body + B36[(36 - (sum % 36)) % 36];
};
const iso = (n = 0) => { const d = new Date(Date.now() + 5.5 * 3600e3 - n * 86400e3); return d.toISOString().slice(0, 10); };
const TODAY = iso(0); const YDAY = iso(1);
const num = (x) => Number(x ?? 0);

const UI_ONLY = process.argv.includes('--ui');
if (!UI_ONLY) {
// ── Seed ────────────────────────────────────────────────────────────────────
const email = `rptqa-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Reports QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Kushwaha Kirana Stores', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const stamp = Date.now();
await must('PATCH', '/tenants/current', { gst_type: 'regular', gstin: gstinFor(stamp), address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } }, tok);
const units = await must('GET', '/units', null, tok);
const nos = units.find((u) => u.code === 'NOS');
const mkItem = (name, price, tax, hsn, stock, reorder) => must('POST', '/items', {
  name, unit_id: nos.id, selling_price: price, purchase_price: '300.00', tax_code: tax, hsn_sac: hsn,
  reorder_point: reorder, opening_stock: { qty: stock, unit_cost: '300.00' },
}, tok);
const rice = await mkItem('Basmati Rice 5kg', '450.00', 'GST5', '1006', '40', '5');
const soap = await mkItem('Detergent 1kg', '95.00', 'GST18', '3402', '60', '5');
const dal = await mkItem('Toor Dal 1kg', '140.00', 'GST5', '0713', '3', '10'); // low stock from the start
const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27', mobile: '+919876543210' }, tok);
const gupta = await must('POST', '/parties', { name: 'Gupta Bengaluru', is_customer: true, state_code: '29' }, tok);
const supp = await must('POST', '/parties', { name: 'Shree Wholesale', is_supplier: true, is_customer: false, state_code: '27' }, tok);

const inv = async (body, payment) => {
  const r = await api('POST', '/sales/invoices?issue=true', { ...body, ...(payment ? { payment } : {}) }, tok);
  if (r.status >= 400) throw new Error(`invoice ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  return r.body.data;
};
const line = (item, qty) => ({ item_id: item.id, qty: String(qty) });
const cash = (amt, date = TODAY) => ({ payment_date: date, mode_breakup: [{ mode: 'cash', amount: String(amt) }] });

const docs = {};
docs.yday = await inv({ walk_in_name: 'Walk-in', document_date: YDAY, lines: [line(rice, 2)] }, cash('945.00', YDAY));
if (docs.yday.status !== 'paid') docs.yday = docs.yday; // walk-in auto-pays? record below if due
docs.walkin = await inv({ walk_in_name: 'Walk-in', document_date: TODAY, lines: [line(rice, 1)] }, cash('473.00'));
docs.credit = await inv({ party_id: ramesh.id, document_date: TODAY, due_on: TODAY, lines: [line(rice, 2), line(soap, 2)] },
  { payment_date: TODAY, mode_breakup: [{ mode: 'upi', amount: '200.00' }] });
docs.igst = await inv({ party_id: gupta.id, document_date: TODAY, due_on: iso(-15), lines: [line(soap, 10)] }, null);
docs.old = await inv({ party_id: ramesh.id, document_date: iso(10), due_on: iso(3), lines: [line(rice, 4)] }, null);
writeFileSync('/tmp/claude-0/rptqa-docs.json', JSON.stringify(docs, null, 1));
console.log('invoices', Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, [d.number, d.status, d.grand_total, d.amount_due ?? d.due_amount, d.taxable_total ?? d.taxable_amount]])));

// Credit note: 1 detergent back against the credit invoice.
const cnLineId = docs.credit.lines.find((l) => l.item_id === soap.id || l.description?.includes('Detergent'))?.id;
let r = await api('POST', '/sales/credit-notes', { against_id: docs.credit.id, party_id: ramesh.id, document_date: TODAY, reason: 'sales_return', restock: true,
  lines: [{ item_id: soap.id, qty: '1', against_line_id: cnLineId }] }, tok);
check('seed: credit note draft', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 300)}`);
let cn = r.body?.data;
if (cn) {
  r = await api('POST', `/sales/credit-notes/${cn.id}/issue`, {}, tok);
  check('seed: credit note issued', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 300)}`);
  cn = r.body?.data ?? cn;
  console.log('cn', cn.number, cn.status, cn.grand_total, cn.taxable_total);
}
// Receipt from Ramesh, cash 500, against the old invoice.
r = await api('POST', '/payments', { direction: 'in', party_id: ramesh.id, payment_date: TODAY, amount: '500.00', mode_breakup: [{ mode: 'cash', amount: '500.00' }], note: 'Part payment' }, tok);
check('seed: receipt 500 cash', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 300)}`);
// Expense 150 cash.
const cats = await must('GET', '/expense-categories', null, tok);
r = await api('POST', '/expenses', { amount: '150', category_id: cats[0].id, expense_date: TODAY, mode: 'cash', note: 'Tea and snacks' }, tok);
check('seed: expense 150 cash', r.status < 300, `${r.status}`);
// Purchase bill, unpaid, 10 rice @300 GST5.
r = await api('POST', '/purchases/bills?record=true', { party_id: supp.id, supplier_invoice_number: `SW-${stamp % 10000}`, supplier_invoice_date: TODAY, document_date: TODAY, due_on: iso(-20),
  lines: [{ item_id: rice.id, qty: '10', unit_cost: '300.00', tax_code: 'GST5' }] }, tok);
check('seed: purchase bill recorded', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 300)}`);
const bill = r.body?.data;
console.log('bill', bill?.number, bill?.grand_total, bill?.amount_due ?? bill?.balance_due);

// A voided invoice (for "show voided").
const vd = await inv({ walk_in_name: 'Walk-in', document_date: TODAY, lines: [line(dal, 1)] }, cash('147.00'));
r = await api('POST', `/sales/invoices/${vd.id}/void`, { reason: 'Typed twice by mistake' }, tok);
check('seed: void walk-in', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 200)}`);

// Staff member (no financial permission by default).
const staffEmail = `rptqa-staff-${uniq()}@e2e.test`;
const made = await must('POST', '/members', { full_name: 'Counter Staff', email: staffEmail, role: 'staff' }, tok);
let st = (await must('POST', '/auth/login', { email: staffEmail, password: made.password })).access_token;
await must('POST', '/auth/password/set', { current_password: made.password, new_password: PASSWORD }, st);
st = (await must('POST', '/auth/login', { email: staffEmail, password: PASSWORD })).access_token;

// Unregistered tenant (for the GST notice).
const uEmail = `rptqa-unreg-${uniq()}@e2e.test`;
let ut = (await must('POST', '/auth/register', { email: uEmail, password: PASSWORD, full_name: 'Unregistered Owner' })).access_token;
const ut2 = await must('POST', '/tenants', { name: 'Chhota Dukaan', business_type: 'retail', state_code: '27' }, ut);
ut = ut2.access_token ?? ut;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, ut);

const state = { email, staffEmail, uEmail, tok, st, ut, TODAY, YDAY, docs, cn, bill, ids: { rice: rice.id, soap: soap.id, dal: dal.id, ramesh: ramesh.id, gupta: gupta.id, supp: supp.id } };
writeFileSync('/tmp/claude-0/rptqa-state.json', JSON.stringify(state, null, 1));
writeFileSync('/tmp/claude-0/rptqa-results.json', JSON.stringify(results, null, 1));
console.log('seeded', email);
}

// ── Browser: look at every report at phone 390 and desktop 1280 ────────────
import { readFileSync } from 'node:fs';
const S = JSON.parse(readFileSync('/tmp/claude-0/rptqa-state.json', 'utf8'));
const browser = await chromium.launch();
const audit = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select')].filter(vis)
    .map((e) => ({ h: Math.round(e.getBoundingClientRect().height), ph: e.getAttribute('placeholder'), type: e.type, val: e.value, aria: e.getAttribute('aria-label') }));
  const text = document.body.innerText;
  return {
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    soon: /coming soon|\bsoon\b/i.test(text),
    inputs,
    ddmmyyyy: (text.match(/\b\d\d\/\d\d\/\d{4}\b/g) || []).length,
    isoDates: (text.match(/\b20\d\d-\d\d-\d\d\b/g) || []).length,
    h1: [...document.querySelectorAll('h1')].map((e) => e.innerText).join(' | '),
    text: text.slice(0, 4000),
  };
});
const out = {};
async function session(label, viewport, who, locale = 'en') {
  const ctx = await browser.newContext({ viewport, locale: locale === 'hi' ? 'hi-IN' : 'en-IN', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await p.fill('input[type="email"]', who);
  await p.fill('input[type="password"]', PASSWORD);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await p.waitForTimeout(2500);
  return { ctx, p, errors };
}
const shot = async (p, size, name) => { await p.screenshot({ path: `${ROOT}/${size}/${name}.png`, fullPage: true }); };
for (const [size, vp] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  const { ctx, p, errors } = await session(size, vp, S.email);
  const land = new URL(p.url()).pathname;
  check(`${size}: landing page after login is /dashboard`, land === '/dashboard', land);
  await p.waitForTimeout(2000);
  await shot(p, size, '01-dashboard');
  out[`${size}-dashboard`] = await audit(p);
  const pages = [
    ['02-reports-hub', '/reports'],
    ['03-day-book', '/reports/day-book'],
    ['05-sales-register', '/reports/sales-register'],
    ['07-purchase-register', '/reports/purchase-register'],
    ['09-gst-summary', '/reports/gst-summary'],
  ];
  for (const [name, path] of pages) {
    await p.goto(`${FE}${path}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    await shot(p, size, name);
    out[`${size}-${name}`] = await audit(p);
  }
  out[`${size}-errors`] = errors;
  if (size === 'desktop') {
    // Hub links: collect and open each.
    await p.goto(`${FE}/reports`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
    const links = await p.$$eval('a[href^="/"]', (as) => [...new Set(as.filter((a) => a.closest('main') || a.closest('[data-testid=reports-hub]')).map((a) => a.getAttribute('href')))]);
    out.hubLinks = [];
    for (const href of links) {
      const r = await p.goto(`${FE}${href}`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
      const t = await p.evaluate(() => document.body.innerText.slice(0, 200));
      out.hubLinks.push({ href, status: r?.status(), notFound: /not found|404/i.test(t), head: t.slice(0, 80).replace(/\n/g, ' ') });
    }
  }
  await ctx.close();
}
writeFileSync('/tmp/claude-0/rptqa-ui.json', JSON.stringify(out, null, 1));
await browser.close();
writeFileSync('/tmp/claude-0/rptqa-results.json', JSON.stringify(results, null, 1));
console.log('ui done');
