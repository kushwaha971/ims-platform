#!/usr/bin/env node
/**
 * WP-03 D-04d — the "which bills does this money go to" lists. On a live
 * stack, a synthetic shop with one customer, three issued bills and an
 * advance received before them, at a 360 px phone and a 1280 laptop:
 *   * the receipt's "Apply to bills" dialog lists every open bill with its
 *     number, date and due, and an amount box per bill;
 *   * no text in the dialog is cut and nothing is wider than the screen;
 *   * applying ₹300 to the first bill reaches the server;
 *   * the receipt sheet keeps its number on one line.
 * Nothing is sent to anybody. Screenshots go to /tmp/e2e-shots/pick-list.
 *
 *   node e2e/pick-list-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { newOwner, must, api } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/pick-list';
mkdirSync(ROOT, { recursive: true });
const iso = (n = 0) => new Date(Date.now() + 5.5 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const owner = await newOwner({ shop: 'Shree Ganesh Kirana', name: 'Pick Owner', prefix: 'pick' });
const T = owner.token;
const units = await must('GET', '/units', null, T);
const U = Object.fromEntries(units.map((u) => [u.code, u.id]));
const rice = await must('POST', '/items', { name: 'Basmati Rice 5kg', item_type: 'goods', unit_id: U.BAG ?? U.NOS, hsn_sac: '1006', tax_code: 'GST0', selling_price: '450.00', opening_stock: { qty: '40', unit_cost: '380', as_of: iso(20) } }, T);

/** Text cut inside the dialog, and how far the page is wider than the screen. */
const measure = (page) => page.evaluate(() => {
  const clipped = [];
  const root = document.querySelector('[role="dialog"]');
  for (const el of root?.querySelectorAll('*') ?? []) {
    if (el.children.length || !el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only')) continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
  }
  return { clipped, overflow: document.documentElement.scrollWidth - window.innerWidth };
});

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['phone-360', { width: 360, height: 780 }], ['laptop-1280', { width: 1280, height: 800 }]]) {
  const party = await must('POST', '/parties', { name: `Ramesh Traders ${size}`, is_customer: true, state_code: '27' }, T);
  const advance = await must('POST', '/payments', { direction: 'in', party_id: party.id, payment_date: iso(10), amount: '1000.00', mode_breakup: [{ mode: 'upi', amount: '1000.00' }], note: 'Advance' }, T);
  for (const days of [8, 5, 2]) {
    const x = await api('POST', '/sales/invoices?issue=true', { party_id: party.id, document_date: iso(days), lines: [{ item_id: rice.id, qty: '1', unit_price: '450.00' }] }, T);
    if (x.status >= 400) throw new Error(`invoice ${x.status} ${JSON.stringify(x.body).slice(0, 300)}`);
  }
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', owner.email);
  await page.fill('input[type="password"]', owner.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/payments/${advance.id}`, { waitUntil: 'networkidle' });
  // Found looking at the first run: on a phone the receipt sheet broke its own
  // number across two lines, "RCT/26-" over "27/0001".
  const number = page.locator('p.font-mono', { hasText: /^RCT\// }).first();
  const lines = await number.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  check(`${size}: the receipt's number is on one line`, lines === 1, `${lines} lines`);
  await page.getByRole('button', { name: 'Apply to bills' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('apply-rows').waitFor({ timeout: 20000 });
  const rows = dialog.locator('[data-testid="apply-rows"] li');
  check(`${size}: every open bill is listed`, (await rows.count()) === 3, `${await rows.count()} rows`);
  check(`${size}: each row says its number, date and due`, /\/.*·.*₹/s.test(await rows.first().innerText()), await rows.first().innerText());
  const m = await measure(page);
  check(`${size}: no text in the dialog is cut`, m.clipped.length === 0, m.clipped.join(' | '));
  check(`${size}: nothing is wider than the screen`, m.overflow <= 0, `${m.overflow}px`);
  await page.screenshot({ path: `${ROOT}/${size}-apply.png` });
  const sent = page.waitForRequest((r) => r.method() === 'POST' && /\/payments\/.+\/(apply|allocat)/.test(r.url()), { timeout: 15000 }).then(() => true).catch(() => false);
  await rows.first().getByRole('textbox').fill('300');
  await dialog.getByRole('button', { name: /^Apply/ }).last().click();
  check(`${size}: applying ₹300 reaches the server`, await sent);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${ROOT}/${size}-applied.png` });
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
