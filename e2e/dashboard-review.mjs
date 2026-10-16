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
  reorder_point: reorder, opening_stock: { qty: stock, unit_cost: '300.00', as_of: iso(220) },
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
// Last financial year's bill, still unpaid: the bill list defaults to THIS
// year, and the overdue figure's link must still open a list that holds it.
await invoice(meena, [{ item_id: dal.id, qty: '1', unit_price: '140.00' }], iso(200), iso(185));
const today1 = await invoice(meena, [{ item_id: rice.id, qty: '2', unit_price: '450.00' }], iso(0));
await invoice(ramesh, [{ item_id: dal.id, qty: '2', unit_price: '140.00' }, { item_id: sugar.id, qty: '2', unit_price: '48.00' }], iso(0));
await api('POST', '/payments', { direction: 'in', document_id: today1.id, payment_date: iso(0), mode_breakup: [{ mode: 'cash', amount: '500.00' }] }, T);
await api('POST', '/payments', { direction: 'in', party_id: suresh.id, payment_date: iso(0), amount: '200.00', mode_breakup: [{ mode: 'upi', amount: '200.00' }] }, T);
// A customer's advance and a supplier paid ahead: money held the other way round,
// which each dues tile must name rather than fold into the other one.
const asha = await customer('Asha Rao', '9822022222');
await must('POST', '/payments', { direction: 'in', party_id: asha.id, payment_date: iso(0), amount: '700.00', mode_breakup: [{ mode: 'cash', amount: '700.00' }] }, T);
const agro = await must('POST', '/parties', { name: 'Agro Traders', is_supplier: true, is_customer: false, state_code: '27' }, T);
await must('POST', '/payments', { direction: 'out', party_id: agro.id, payment_date: iso(0), amount: '300.00', mode_breakup: [{ mode: 'cash', amount: '300.00' }] }, T);
const bill = await api('POST', '/purchases/bills?record=true', { party_id: gupta.id, supplier_invoice_number: `GW-${Date.now() % 10000}`, supplier_invoice_date: iso(12), document_date: iso(12), due_on: iso(2), lines: [{ item_id: rice.id, qty: '10', unit_cost: '300.00', tax_code: 'GST5' }] }, T);
console.log('purchase bill', bill.status);
// The Udhaar book's own "You got ₹300, cash": that app's money, which the
// Shop's Cash in hand, day book and cashbook must not count (DEC-019).
console.log('udhaar got', (await api('POST', '/ledger-entries', { party_id: ramesh.id, direction: 'credit', amount: '300.00', entry_date: iso(0), payment_mode: 'cash' }, T)).status);
const cats = await api('GET', '/expense-categories', null, T);
const catList = cats.body.data?.results ?? cats.body.data ?? [];
if (catList.length) console.log('expense', (await api('POST', '/expenses', { amount: '150', category_id: catList[0].id, expense_date: iso(0), mode: 'cash', note: 'Tea for staff' }, T)).status);
// A supplier bill falling due in three days, and one in ten (not this week).
for (const [due, qty] of [[-3, '2'], [-10, '1']]) {
  const r = await api('POST', '/purchases/bills?record=true', { party_id: gupta.id, supplier_invoice_number: `GWD-${qty}-${Date.now() % 10000}`, supplier_invoice_date: iso(1), document_date: iso(1), due_on: iso(due), lines: [{ item_id: dal.id, qty, unit_cost: '100.00', tax_code: 'GST5' }] }, T);
  if (r.status >= 400) throw new Error(`bill ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
}
// Orders waiting on someone (WP-06 spec order 4): a customer order confirmed
// twelve days ago, goods out on a challan four days ago, and a purchase order
// sent to the supplier six days ago, none of them billed yet.
const so = (await must('POST', '/sales/orders', { party_id: meena.id, document_date: iso(12), lines: [{ item_id: dal.id, qty: '5' }] }, T));
await must('POST', `/sales/orders/${so.id}/confirm`, {}, T);
const dc = await must('POST', '/sales/delivery-challans', { party_id: ramesh.id, document_date: iso(4), lines: [{ item_id: rice.id, qty: '1' }] }, T);
await must('POST', `/sales/delivery-challans/${dc.id}/issue`, {}, T);
const po = await must('POST', '/purchases/orders', { party_id: gupta.id, document_date: iso(6), lines: [{ item_id: sugar.id, qty: '20', unit_cost: '40.00' }] }, T);
await must('POST', `/purchases/orders/${po.id}/send`, {}, T);

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
  const ctx = await browser.newContext({ viewport, locale: 'en-IN', serviceWorkers: 'block' });
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
  // The dues tiles must add up to the lists they open (DASH-01, DASH-02).
  if (size === '360' || size === '1280') {
    const list = async (q) => (await api('GET', `/parties?${q}&book=shop&status=active`, null, T)).body.meta.totals;
    const dash = (await api('GET', '/reports/dashboard?refresh=true', null, T)).body.data.tiles;
    const owe = await list('type=customer&balance=owes_me');
    const due = await list('type=supplier&balance=i_owe');
    report[size].dues = { toCollect: dash.to_collect, customers: owe.receivable, toPay: dash.to_pay, suppliers: due.payable };
    console.log(`${size}: To collect ${dash.to_collect.amount} vs customers ${owe.receivable}; To pay ${dash.to_pay.amount} vs suppliers ${due.payable}; advances ${dash.to_collect.advances} / ${dash.to_pay.advances}`);
    console.log(`   texts: ${JSON.stringify(await page.locator('text=/paid .* ahead/').allInnerTexts())}`);
    // Cash in hand is the Shop's drawer: the cashbook's closing cash for today.
    const cb = (await api('GET', `/cashbook?date_from=${iso(0)}&date_to=${iso(0)}`, null, T)).body.data;
    console.log(`   Cash in hand ${dash.shop_cash_in_hand?.amount} vs cashbook ${cb.range.closing.cash} (every book ${dash.cash_in_hand?.amount})`);
    // Overdue is decided on the day, and its link opens a list holding every one.
    for (const [region, rx, path, tile] of [
      ['Customers', /bills? overdue/, '/sales/invoices', dash.overdue?.invoices],
      ['Suppliers', /bills? overdue/, '/purchases/bills', dash.supplier_bills?.overdue],
    ]) {
      const link = page.getByRole('region', { name: region }).getByRole('link', { name: rx });
      const href = (await link.count()) ? await link.first().getAttribute('href') : null;
      const qs = new URLSearchParams((href ?? '').split('?')[1] ?? '');
      const wire = new URLSearchParams({ tab: 'overdue' });
      if (qs.get('from')) { wire.set('date_from', qs.get('from')); wire.set('date_to', qs.get('to')); }
      const listed = (await api('GET', `${path}?${wire}`, null, T)).body.meta.totals;
      console.log(`   ${region} overdue ${tile?.count} · ${tile?.amount} vs list ${listed.count} · ${listed.amount_due} (${href})`);
    }
    // "Due this week" opens exactly the bills it counted.
    {
      const link = page.getByRole('region', { name: 'Suppliers' }).getByRole('link', { name: /due this week/ });
      const href = (await link.count()) ? await link.first().getAttribute('href') : null;
      const qs = new URLSearchParams((href ?? '').split('?')[1] ?? '');
      const wire = new URLSearchParams({ tab: qs.get('tab') ?? '', date_from: qs.get('from') ?? '', date_to: qs.get('to') ?? '', due_from: qs.get('due_from') ?? '', due_to: qs.get('due_to') ?? '' });
      const listed = (await api('GET', `/purchases/bills?${wire}`, null, T)).body.meta?.totals;
      console.log(`   due this week ${dash.supplier_bills?.due_week?.count} · ${dash.supplier_bills?.due_week?.amount} vs list ${listed?.count} · ${listed?.amount_due} (${href})`);
      if (href) {
        await link.first().click();
        await page.waitForURL(/\/purchases\/bills/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        console.log(`   bill list shows chip: ${await page.getByRole('button', { name: /^Due / }).count()}`);
        await page.screenshot({ path: `${ROOT}/${size}-due-week-list.png` });
        await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
      }
    }
    // Each order row equals the list its link opens.
    for (const [rx, path] of [[/customer orders? to deliver/, '/sales/orders'], [/challans? not billed/, '/sales/delivery-challans'], [/purchase orders? waiting/, '/purchases/orders']]) {
      const link = page.getByRole('region', { name: 'Needs attention' }).getByRole('link', { name: rx });
      const href = (await link.count()) ? await link.first().getAttribute('href') : null;
      const qs = new URLSearchParams((href ?? '').split('?')[1] ?? '');
      const wire = new URLSearchParams({ tab: qs.get('tab') ?? '' });
      if (qs.get('from')) { wire.set('date_from', qs.get('from')); wire.set('date_to', qs.get('to')); }
      const listed = (await api('GET', `${path}?${wire}`, null, T)).body.meta?.totals;
      console.log(`   order row ${rx}: "${href ? (await link.first().innerText()).replace(/\s+/g, ' ') : 'none'}" vs list ${listed?.count} · ${listed?.grand_total} (${href})`);
    }
    for (const name of ['Today', 'Customers', 'Suppliers', 'Needs attention']) {
      console.log(`   region "${name}": ${await page.getByRole('region', { name }).count()}`);
    }
  }
  if (size === '360' || size === '1280') {
    // The overdue line opens the bill list over the range that holds every one.
    await page.getByRole('region', { name: 'Customers' }).getByRole('link', { name: /bills? overdue/ }).first().click();
    await page.waitForURL(/\/sales\/invoices/, { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${ROOT}/${size}-overdue-list.png` });
    await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
  }
  if (size === '360' || size === '1280') {
    // DASH-04 — one part failing: the server names it; the page keeps the rest.
    // The failure is staged by rewriting the response, since a live query cannot
    // be made to fail on demand.
    await page.route((url) => url.pathname.endsWith("/reports/dashboard"), async (route) => {

      const res = await route.fetch();
      const body = await res.json();
      delete body.data.tiles.supplier_bills;
      body.data.recent_activity = [];
      body.data.unavailable = ['supplier_bills', 'recent_activity'];
      await route.fulfill({ response: res, json: body });
    });
    await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const lines = await page.getByText('This section could not load.').count();
    const nothing = await page.getByText('Nothing needs you right now.').count();
    console.log(`   one part failing: ${lines} panels say so, "Nothing needs you" shown ${nothing}, regions ${await page.getByRole('region').count()}`);
    await page.screenshot({ path: `${ROOT}/${size}-part-failed.png`, fullPage: true });
    await page.unrouteAll();
    await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
  }
  if (size === '360') {
    // More → Record payment must open the payment form, not just the list.
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('dialog', { name: 'More actions' }).getByRole('link', { name: 'Record payment' }).click();
    await page.waitForURL(/\/payments/, { timeout: 20000 });
    const form = await page.getByRole('dialog').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    console.log(`   Record payment opens the form: ${form}`);
    await page.screenshot({ path: `${ROOT}/${size}-record-payment.png` });
  }
  const r = report[size];
  console.log(`${size}: height ${r.height}px, overflow ${r.overflow}px, cut ${r.clipped.length}${r.clipped.length ? ` [${r.clipped.join(' | ')}]` : ''}${errors.length ? `, errors ${errors.join(' | ')}` : ''}`);
  console.log(`   sections: ${r.sections.map((s) => `${s.text}@${s.top}`).join(', ')}`);
  await ctx.close();
}
// WP-06 Finding 4 — a new Shop whose first cash record is a tea expense. No
// opening cash is recorded, so the drawer is −₹150 by arithmetic; the tile must
// say it is more paid out than came in since that day, not a till of −₹150.
const fresh = await newOwner({ shop: 'Naya Kirana', name: 'New Owner', prefix: 'dashnew' });
// The first-use screen shows no figures; a shop that has added a customer does.
await must('POST', '/parties', { name: 'Pehla Grahak', is_customer: true, mobile: '9822033333', state_code: '27' }, fresh.token);
const freshCatsBody = (await api('GET', '/expense-categories', null, fresh.token)).body.data;
const freshCats = freshCatsBody?.results ?? freshCatsBody ?? [];
if (freshCats.length) await must('POST', '/expenses', { amount: '150', category_id: freshCats[0].id, expense_date: iso(0), mode: 'cash', note: 'Tea' }, fresh.token);
const freshCash = (await api('GET', '/reports/dashboard?refresh=true', null, fresh.token)).body.data.tiles.shop_cash_in_hand;
console.log(`new shop: drawer ${JSON.stringify(freshCash)}`);
for (const [size, viewport] of WIDTHS.filter(([w]) => w === '360' || w === '1280')) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', fresh.email);
  await page.fill('input[type="password"]', fresh.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ROOT}/${size}-new-shop.png`, fullPage: true });
  const today = page.getByRole('region', { name: 'Today' });
  if (!(await today.count())) { console.log(`   ${size} new shop: no Today region at ${page.url()}`); await ctx.close(); continue; }
  console.log(`   ${size} new shop Today: ${JSON.stringify((await today.innerText()).replace(/\s+/g, ' '))}`);
  await today.screenshot({ path: `${ROOT}/${size}-new-shop-cash.png` });
  await ctx.close();
}
await browser.close();
writeFileSync(`${ROOT}/report.json`, JSON.stringify({ report, network }, null, 2));
console.log(`\nserver answers at 1280: ${network.map((n) => `${n.status} ${n.url}`).join('\n  ')}`);
