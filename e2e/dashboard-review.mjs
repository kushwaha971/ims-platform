#!/usr/bin/env node
/**
 * WP-06 design review — the Shop dashboard as it is, before any build. On a
 * live stack, a synthetic kirana with customers who owe, suppliers it owes,
 * today's bills and receipts, an expense, a return, one item out of stock and
 * one below its reorder point. For every width the spec names (UX-05) it:
 *   * screenshots the whole page and the first screen;
 *   * measures page width against the viewport, and every text node against
 *     its own box, so a cut figure or label is found and not guessed at;
 *   * records how far down the page each section starts, so "what needs
 *     action" can be compared with the fold.
 * It also prints what the server answered for the figures, so the review can
 * check each card against the records it should reproduce. Nothing is sent to
 * anybody. Output in /tmp/e2e-shots/dashboard-review.
 *
 *   node e2e/dashboard-review.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { newOwner, must, api } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/dashboard-review';
mkdirSync(ROOT, { recursive: true });
const iso = (n = 0) => new Date(Date.now() + 5.5 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
const WIDTHS = [
  ['360', { width: 360, height: 780 }],
  ['390', { width: 390, height: 844 }],
  ['768', { width: 768, height: 1024 }],
  ['1024', { width: 1024, height: 768 }],
  ['1280', { width: 1280, height: 800 }],
  ['1440', { width: 1440, height: 900 }],
  ['1536', { width: 1536, height: 864 }],
  ['1920', { width: 1920, height: 1080 }],
];

const owner = await newOwner({ shop: 'Shree Ganesh Kirana Stores', name: 'Dash Owner', prefix: 'dash' });
const T = owner.token;
const units = await must('GET', '/units', null, T);
const nos = units.find((u) => u.code === 'NOS') ?? units[0];
const item = (name, price, stock, reorder) => must('POST', '/items', {
  name, item_type: 'goods', unit_id: nos.id, selling_price: price, purchase_price: '300.00', tax_code: 'GST5', hsn_sac: '1006',
  reorder_point: reorder, opening_stock: { qty: stock, unit_cost: '300.00', as_of: iso(60) },
}, T);
const rice = await item('Basmati Rice 5kg', '450.00', '60', '5');
const dal = await item('Toor Dal 1kg', '140.00', '12', '10');
const sugar = await item('Sugar 1kg', '48.00', '2', '5');

const customer = (name, mobile) => must('POST', '/parties', { name, is_customer: true, mobile, state_code: '27' }, T);
const ramesh = await customer('Ramesh Traders', '9822012345');
const suresh = await customer('Suresh Kumar General Store, Station Road', '9822054321');
const meena = await customer('Meena Devi', '9822011111');
const gupta = await must('POST', '/parties', { name: 'Gupta Wholesale', is_supplier: true, is_customer: false, mobile: '9822099999', state_code: '27' }, T);
const invoice = async (party, lines, date, due) => {
  const r = await api('POST', '/sales/invoices?issue=true', { party_id: party.id, document_date: date, ...(due ? { due_on: due } : {}), lines }, T);
  if (r.status >= 400) throw new Error(`invoice ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.data;
};
await invoice(ramesh, [{ item_id: rice.id, qty: '4', unit_price: '450.00' }], iso(40), iso(25));
await invoice(suresh, [{ item_id: dal.id, qty: '3', unit_price: '140.00' }], iso(9));
const today1 = await invoice(meena, [{ item_id: rice.id, qty: '2', unit_price: '450.00' }], iso(0));
await invoice(ramesh, [{ item_id: dal.id, qty: '2', unit_price: '140.00' }, { item_id: sugar.id, qty: '2', unit_price: '48.00' }], iso(0));
await api('POST', '/payments', { direction: 'in', document_id: today1.id, payment_date: iso(0), mode_breakup: [{ mode: 'cash', amount: '500.00' }] }, T);
await api('POST', '/payments', { direction: 'in', party_id: suresh.id, payment_date: iso(0), amount: '200.00', mode_breakup: [{ mode: 'upi', amount: '200.00' }] }, T);
const bill = await api('POST', '/purchases/bills?record=true', { party_id: gupta.id, supplier_invoice_number: `GW-${Date.now() % 10000}`, supplier_invoice_date: iso(12), document_date: iso(12), due_on: iso(2), lines: [{ item_id: rice.id, qty: '10', unit_cost: '300.00', tax_code: 'GST5' }] }, T);
console.log('purchase bill', bill.status);
const cats = await api('GET', '/expense-categories', null, T);
const catList = cats.body.data?.results ?? cats.body.data ?? [];
if (catList.length) console.log('expense', (await api('POST', '/expenses', { amount: '150', category_id: catList[0].id, expense_date: iso(0), mode: 'cash', note: 'Tea for staff' }, T)).status);

const measure = (page) => page.evaluate(() => {
  const clipped = [];
  for (const el of document.querySelectorAll('main *')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only')) continue;
    if (el.closest('[class*="overflow-x-auto"]')) continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.textContent.trim().slice(0, 40)}${cs.textOverflow === 'ellipsis' ? ' (…)' : ''}`);
  }
  const sections = [...document.querySelectorAll('main h2, main [role="heading"]')].map((h) => ({
    text: h.textContent.trim().slice(0, 40), top: Math.round(h.getBoundingClientRect().top + window.scrollY),
  }));
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, height: document.documentElement.scrollHeight, clipped, sections };
});

const report = {};
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const network = [];
for (const [size, viewport] of WIDTHS) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (size === '1280') page.on('response', async (r) => {
    if (/\/api\/v1\/(reports|dashboard)/.test(r.url())) network.push({ url: r.url().replace(/^.*\/api\/v1/, ''), status: r.status(), body: await r.text().catch(() => '') });
  });
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', owner.email);
  await page.fill('input[type="password"]', owner.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ROOT}/${size}-fold.png` });
  await page.screenshot({ path: `${ROOT}/${size}-full.png`, fullPage: true });
  report[size] = { ...(await measure(page)), errors };
  const r = report[size];
  console.log(`${size}: height ${r.height}px, overflow ${r.overflow}px, cut ${r.clipped.length}${r.clipped.length ? ` [${r.clipped.join(' | ')}]` : ''}${errors.length ? `, errors ${errors.join(' | ')}` : ''}`);
  console.log(`   sections: ${r.sections.map((s) => `${s.text}@${s.top}`).join(', ')}`);
  await ctx.close();
}
await browser.close();
writeFileSync(`${ROOT}/report.json`, JSON.stringify({ report, network }, null, 2));
console.log(`\nserver answers at 1280: ${network.map((n) => `${n.status} ${n.url}`).join('\n  ')}`);
