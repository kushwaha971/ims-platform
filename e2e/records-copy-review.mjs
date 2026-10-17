#!/usr/bin/env node
/**
 * WP-07 look — the records row on a live stack: the add drawer says the word
 * its list's button said (Add customer, Add supplier), a number held by an
 * ARCHIVED party is reported as archived with the way back, Suppliers'
 * select-all names suppliers, and a phone's Items card shows the price per
 * unit (SH-012). Four widths, measured for page width and cut text. Output in
 * /tmp/e2e-shots/records-copy. Nothing is sent to anybody.
 *
 *   node e2e/records-copy-review.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { newOwner, must } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/records-copy';
mkdirSync(ROOT, { recursive: true });
const WIDTHS = [
  ['360', { width: 360, height: 780 }],
  ['768', { width: 768, height: 1024 }],
  ['1280', { width: 1280, height: 800 }],
  ['1920', { width: 1920, height: 1080 }],
];

const owner = await newOwner({ shop: 'Shree Ganesh Kirana Stores', name: 'Records Owner', prefix: 'records' });
const T = owner.token;
const units = await must('GET', '/units', null, T);
const nos = units.find((u) => u.code === 'NOS') ?? units[0];
await must('POST', '/items', { name: 'Lifebuoy Soap 100g', item_type: 'goods', unit_id: nos.id, selling_price: '1059.00', purchase_price: '40.00', tax_code: 'GST18', hsn_sac: '3401' }, T);
const old = await must('POST', '/parties', { name: 'Old Friend Traders', is_customer: true, mobile: '+919822011111' }, T);
await must('POST', `/parties/${old.party?.id ?? old.id}/archive`, {}, T);
await must('POST', '/parties', { name: 'Gupta Wholesale', is_supplier: true, is_customer: false, mobile: '+919822022222' }, T);

const measure = (page, scope = 'body') => page.evaluate((sel) => {
  const clipped = [];
  for (const el of document.querySelectorAll(`${sel} *`)) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only')) continue;
    if (el.closest('[class*="overflow-x-auto"]')) continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 60));
  }
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, clipped };
}, scope);

const failures = [];
const check = (size, name, ok, detail = '') => {
  if (!ok) failures.push(`${size}: ${name} ${detail}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${size} ${name} ${detail}`);
};
const fits = async (size, page, what, scope) => {
  const m = await measure(page, scope);
  check(size, `${what}: page fits`, m.overflow <= 0, String(m.overflow));
  check(size, `${what}: nothing cut`, m.clipped.length === 0, m.clipped.join(' | '));
};
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of WIDTHS) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', owner.email);
  await page.fill('input[type="password"]', owner.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  // 1. Customers: the drawer answers "Add customer" with "Add customer".
  await page.goto(`${FE}/customers`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /add customer/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add customer' });
  await dialog.waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await dialog.isVisible())) await page.screenshot({ path: `${ROOT}/${size}-0-debug.png` });
  check(size, 'Customers opens "Add customer"', await dialog.isVisible());
  check(size, 'and saves with "Save customer"', await dialog.getByRole('button', { name: 'Save customer' }).isVisible());

  // 2. A number an archived party holds.
  await dialog.getByRole('textbox', { name: /^name/i }).fill('Old Friend Again');
  await dialog.getByRole('textbox', { name: /mobile/i }).fill('9822011111');
  await dialog.getByRole('button', { name: 'Save customer' }).click();
  const archived = dialog.getByText('You archived the party with this number');
  await archived.waitFor({ timeout: 15000 }).catch(() => {});
  check(size, 'archived holder is named as archived', await archived.isVisible());
  const link = dialog.getByRole('link', { name: 'Open it to restore' });
  check(size, 'and offers the way back', await link.isVisible());
  await archived.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${ROOT}/${size}-1-archived-number.png` });
  await fits(size, page, 'archived banner', '[role="dialog"]');
  await link.click();
  await page.waitForURL(/\/parties\//, { timeout: 30000 });
  const restore = page.getByRole('button', { name: 'Restore' }).first();
  await restore.waitFor({ timeout: 15000 }).catch(() => {});
  check(size, 'the page it opens offers Restore', await restore.isVisible());

  // 3. Suppliers: drawer title, and on a wide screen the select-all box.
  await page.goto(`${FE}/suppliers`, { waitUntil: 'networkidle' });
  if (viewport.width >= 1280) {
    const all = page.getByRole('checkbox', { name: 'Select every supplier on this page' });
    await all.waitFor({ timeout: 15000 }).catch(() => {});
    check(size, 'Suppliers select-all names suppliers', await all.isVisible());
  }
  await page.getByRole('button', { name: /add supplier/i }).first().click();
  const supplier = page.getByRole('dialog', { name: 'Add supplier' });
  await supplier.waitFor({ timeout: 15000 }).catch(() => {});
  check(size, 'Suppliers opens "Add supplier"', await supplier.isVisible());
  await page.screenshot({ path: `${ROOT}/${size}-2-add-supplier.png` });
  await page.keyboard.press('Escape');

  // 4. Items: on a phone the card says the price per unit.
  await page.goto(`${FE}/items`, { waitUntil: 'networkidle' });
  if (viewport.width < 768) {
    const price = page.getByText('₹1,059.00 per NOS');
    await price.waitFor({ timeout: 15000 }).catch(() => {});
    check(size, 'phone item card shows the price per unit', await price.isVisible());
  }
  await page.screenshot({ path: `${ROOT}/${size}-3-items.png` });
  await fits(size, page, 'items list', 'main');

  check(size, 'no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
