#!/usr/bin/env node
/**
 * e2e/final-payments-qa.mjs — independent QA of PAY-01..05, LED-10, PUR-01..04.
 *   node e2e/final-payments-qa.mjs seed        → writes state to $STATE (default /tmp/e2e-shots/qa-final/payments/state.json)
 *   node e2e/final-payments-qa.mjs ui <phase>  → browser phases against the seeded account
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { newOwner, must, api, uniq } from './lib/fixtures.mjs';

export const FE = 'http://localhost:3000';
export const OUT = '/tmp/e2e-shots/qa-final/payments';
const STATE = process.env.STATE ?? `${OUT}/state.json`;
mkdirSync(`${OUT}/phone`, { recursive: true }); mkdirSync(`${OUT}/desktop`, { recursive: true });
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed) => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `27${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => { const product = B36.indexOf(ch) * (i % 2 ? 2 : 1); sum += Math.floor(product / 36) + (product % 36); });
  return body + B36[(36 - (sum % 36)) % 36];
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function seed() {
  const o = await newOwner({ shop: 'Sharma Kirana Store', name: 'Rajesh Sharma', prefix: 'qa-pay' });
  const T = o.token;
  const g = gstinFor(Date.now());
  let r = await api('PATCH', '/tenants/current', { gst_type: 'regular', gstin: g, phone: '9876543210', address: { line1: '14 Station Road', city: 'Nashik', state: 'Maharashtra', pincode: '422001', state_code: '27' } }, T);
  console.log('profile', r.status, JSON.stringify(r.body.error ?? '').slice(0, 300));
  const units = await must('GET', '/units', null, T);
  const U = Object.fromEntries(units.map((u) => [u.code, u.id]));
  const rice = await must('POST', '/items', { name: 'Basmati Rice 5kg', item_type: 'goods', unit_id: U.BAG ?? U.NOS, hsn_sac: '1006', tax_code: 'GST5', selling_price: '450.00', purchase_price: '380.00', opening_stock: { qty: '40', unit_cost: '380', as_of: daysAgo(20) } }, T);
  const dal = await must('POST', '/items', { name: 'Toor Dal 1kg', item_type: 'goods', unit_id: U.PCS ?? U.NOS, hsn_sac: '0713', tax_code: 'GST5', selling_price: '165.00', purchase_price: '140.00', opening_stock: { qty: '25', unit_cost: '140', as_of: daysAgo(20) } }, T);
  const sugar = await must('POST', '/items', { name: 'Sugar 1kg', item_type: 'goods', unit_id: U.PCS ?? U.NOS, hsn_sac: '1701', tax_code: 'GST5', selling_price: '48.00' }, T);
  const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, mobile: '9822012345', state_code: '27' }, T);
  const suresh = await must('POST', '/parties', { name: 'Suresh Kumar', is_customer: true, mobile: '9822054321', state_code: '27' }, T);
  const gupta = await must('POST', '/parties', { name: 'Gupta Wholesale', is_customer: false, is_supplier: true, mobile: '9822099999', state_code: '27' }, T);
  const inv = async (party, lines, date) => {
    const x = await api('POST', '/sales/invoices?issue=true', { party_id: party.id, document_date: date, lines }, T);
    if (x.status >= 400) throw new Error(`invoice ${x.status} ${JSON.stringify(x.body).slice(0, 400)}`);
    return x.body.data;
  };
  const i1 = await inv(ramesh, [{ item_id: rice.id, qty: '2', unit_price: '450.00' }], daysAgo(15));
  const i2 = await inv(ramesh, [{ item_id: dal.id, qty: '3', unit_price: '165.00' }], daysAgo(8));
  const i3 = await inv(suresh, [{ item_id: rice.id, qty: '1', unit_price: '450.00' }, { item_id: dal.id, qty: '2', unit_price: '165.00' }], daysAgo(5));
  const s = { email: o.email, password: o.password, tenant: o.tenantId, rice: rice.id, dal: dal.id, sugar: sugar.id, ramesh: ramesh.id, suresh: suresh.id, gupta: gupta.id,
    inv: [i1, i2, i3].map((d) => ({ id: d.id, number: d.number, total: d.grand_total, due: d.amount_due })) };
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  console.log(JSON.stringify(s, null, 2));
}
if (process.argv[2] === 'seed') await seed();

// ─── Browser helpers ─────────────────────────────────────────────────────────
export const S = () => JSON.parse(readFileSync(STATE, 'utf8'));
export async function open(vp = 'desktop', { hi = false } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
  if (hi) await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.open = (u) => { window.__opened = u; return null; }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const st = S();
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', st.email);
  await page.fill('input[type="password"]', st.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForTimeout(1500);
  const shot = async (name, full = true) => page.screenshot({ path: `${OUT}/${vp}/${name}.png`, fullPage: full });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const go = async (path, wait = 2500) => { await page.goto(`${FE}${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(wait); };
  return { browser, ctx, page, shot, overflow, go, errors, st };
}
const phase = process.argv[2] === 'ui' ? process.argv[3] : null;
if (phase) {
  const mod = await import(`${OUT}/phase-${phase}.mjs`);
  await mod.default({ open, S, OUT, FE, must, api });
}
