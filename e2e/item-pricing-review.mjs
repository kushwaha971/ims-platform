#!/usr/bin/env node
/**
 * WP-07 look — an item's purchase price, selling price and margin on a live
 * stack, as the owner works them. It adds an item by typing a cost and a
 * margin and reads back the price the form set; opens a GST-inclusive item and
 * reads the margin without its GST; types a price below cost and looks for the
 * warning; then opens the invoice's item picker and reads each option's price
 * line. Below lg it opens the item's Edit from the page's ⋯ sheet with a real
 * tap, which is how a phone reaches it. Every screen is photographed at four widths and measured for page width
 * and cut text. Output in /tmp/e2e-shots/item-pricing. Nothing is sent to anybody.
 *
 *   node e2e/item-pricing-review.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { newOwner, must } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/item-pricing';
mkdirSync(ROOT, { recursive: true });
const WIDTHS = [
  ['360', { width: 360, height: 780 }],
  ['768', { width: 768, height: 1024 }],
  ['1280', { width: 1280, height: 800 }],
  ['1920', { width: 1920, height: 1080 }],
];

const owner = await newOwner({ shop: 'Shree Ganesh Kirana Stores', name: 'Price Owner', prefix: 'price' });
const T = owner.token;
const units = await must('GET', '/units', null, T);
const nos = units.find((u) => u.code === 'NOS') ?? units[0];
const soapItem = await must('POST', '/items', { name: 'Lifebuoy Soap 100g', item_type: 'goods', unit_id: nos.id, selling_price: '59.00', purchase_price: '40.00', tax_code: 'GST18', tax_inclusive_selling: true, hsn_sac: '3401' }, T);
await must('POST', '/items', { name: 'Basmati Rice 5kg', item_type: 'goods', unit_id: nos.id, selling_price: '450.00', purchase_price: '380.00', tax_code: 'GST5', hsn_sac: '1006' }, T);
await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, mobile: '9822012345', state_code: '27' }, T);

const measure = (page) => page.evaluate(() => {
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only')) continue;
    if (el.closest('[class*="overflow-x-auto"]')) continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.textContent.trim().slice(0, 60)}${cs.textOverflow === 'ellipsis' ? ' (…)' : ''}`);
  }
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, clipped };
});

const report = {};
const failures = [];
const check = (size, name, ok, detail = '') => {
  if (!ok) failures.push(`${size}: ${name} ${detail}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${size} ${name} ${detail}`);
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
  report[size] = { errors };

  // 1. A new item: type the cost, then the margin, and the price follows.
  await page.goto(`${FE}/items`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /add item|new item/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^item name/i }).fill(`Toor Dal ${size}`);
  await page.screenshot({ path: `${ROOT}/${size}-1-new-empty.png` });
  check(size, 'margin waits for a cost', await dialog.getByRole('textbox', { name: /margin/i }).isDisabled());
  await dialog.getByRole('textbox', { name: /purchase price/i }).fill('100');
  await dialog.getByRole('textbox', { name: /margin/i }).fill('20');
  const price = await dialog.getByRole('textbox', { name: /selling price/i }).inputValue();
  check(size, 'cost 100 at 20% margin prices 125', price === '125.00', price);
  await dialog.getByRole('textbox', { name: /margin/i }).blur();
  await page.screenshot({ path: `${ROOT}/${size}-2-new-priced.png` });
  report[size].newForm = await measure(page);
  // Below cost: the warning says so.
  await dialog.getByRole('textbox', { name: /selling price/i }).fill('90');
  const loss = await dialog.getByRole('textbox', { name: /margin/i }).inputValue();
  check(size, 'price 90 on cost 100 reads -11.1%', loss === '-11.1', loss);
  check(size, 'selling below cost is said', await dialog.getByText('Selling below cost').isVisible());
  await page.screenshot({ path: `${ROOT}/${size}-3-below-cost.png` });
  await dialog.getByRole('textbox', { name: /selling price/i }).fill('130');
  await dialog.getByRole('button', { name: /^save/i }).click();
  await page.waitForTimeout(1500);
  check(size, 'the item saves', !(await dialog.isVisible().catch(() => false)));

  // 2. The inclusive item: its margin is read without the GST.
  await page.goto(`${FE}/items/${soapItem.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const marginRow = await page.getByText('20.0%', { exact: true }).isVisible().catch(() => false);
  check(size, 'item page shows the soap\'s 20.0% margin', marginRow);
  await page.screenshot({ path: `${ROOT}/${size}-4a-item-page.png`, fullPage: true });
  const editButton = page.getByRole('button', { name: /^edit/i }).first();
  if (await editButton.isVisible().catch(() => false)) await editButton.click();
  else {
    await page.getByRole('button', { name: /more actions/i }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /^edit/i }).first().click();
  }
  const edit = page.getByRole('dialog');
  // Below lg this is a REAL tap on the ⋯ sheet's Edit: until WP-07 it closed
  // the sheet and opened nothing, which no unit test could see.
  const opened = await edit.getByRole('textbox', { name: /margin/i }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  check(size, 'Edit opens the item form (from the ⋯ sheet below lg)', opened);
  if (!opened) { await ctx.close(); continue; }
  const soap = await edit.getByRole('textbox', { name: /margin/i }).inputValue();
  check(size, 'soap ₹59 incl. 18% GST on cost ₹40 is 20.0%', soap === '20.0', soap);
  await page.screenshot({ path: `${ROOT}/${size}-4-edit-inclusive.png` });
  await page.keyboard.press('Escape');

  // 3. The invoice's item picker names the usual price, cost and margin.
  await page.goto(`${FE}/sales/invoices/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const pick = page.getByRole('combobox', { name: /item/i }).first();
  await pick.click();
  await page.waitForTimeout(1500);
  const options = await page.getByRole('option').allInnerTexts();
  const soapLine = options.find((o) => o.includes('Lifebuoy')) ?? '';
  check(size, 'picker: soap reads usual price, cost and margin', /Usual price ₹59\.00 · Cost ₹40\.00 · 20\.0% margin/.test(soapLine), JSON.stringify(soapLine));
  await page.screenshot({ path: `${ROOT}/${size}-5-picker.png` });
  report[size].picker = await measure(page);
  check(size, 'no price line cut', !report[size].picker.clipped.some((text) => text.includes('Usual price')), JSON.stringify(report[size].picker.clipped));
  check(size, 'no page wider than the screen', report[size].picker.overflow <= 0 && report[size].newForm.overflow <= 0);
  check(size, 'no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
writeFileSync(`${ROOT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { form: v.newForm?.clipped, picker: v.picker?.clipped }])), null, 1));
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
