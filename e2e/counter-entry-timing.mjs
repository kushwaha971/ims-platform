#!/usr/bin/env node
/**
 * WP-05 exit evidence — a counter bill keyed in by keyboard alone, timed, and
 * checked against the server. On a live stack, for 1, 10 and 50 lines, at a
 * 1280 laptop (the table, layout A) and a 1536 desktop (side totals):
 *   * a walk-in sale is opened at /sales/invoices/new;
 *   * every line is entered with keys only: Alt+N for a new line, Enter to open
 *     the item search, its code, Enter to take it (the caret moves on to Qty),
 *     the quantity — a Tab is pressed and counted only if the caret did not;
 *   * Ctrl+Enter issues, and the payment sheet is confirmed with Enter;
 *   * the issued invoice's grand total from the API must equal the sum the
 *     script worked out itself, and the figure the editor showed before Issue;
 *   * keystrokes, seconds per line and seconds to issued are recorded.
 * The shop and its items are synthetic. Nothing is sent to anybody. Results go
 * to /tmp/e2e-shots/counter-timing/timing.json.
 *
 *   node e2e/counter-entry-timing.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/counter-timing';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
// "Item, Line 1" — anchored, so line 1 never matches line 10.
const lineLabel = (field, n) => new RegExp(`^${field}, line ${n}$`, 'i');
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const email = `countertime-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Counter Timing Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Kirana', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const nos = (await must('GET', '/units', null, tok)).find((u) => u.code === 'NOS');
const items = [];
for (let i = 1; i <= 50; i += 1) {
  const code = `K${String(i).padStart(3, '0')}`;
  const price = `${(10 + i * 3.25).toFixed(2)}`;
  const item = await must('POST', '/items', {
    name: `Kirana item ${code}`, sku: code, unit_id: nos.id, selling_price: price, purchase_price: '5.00',
    tax_code: 'GST5', hsn_sac: '1006', opening_stock: { qty: '1000', unit_cost: '5.00' },
  }, tok);
  items.push({ ...item, code, price });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const results = [];
for (const [size, viewport] of [['laptop-1280', { width: 1280, height: 800 }], ['desktop-1536', { width: 1536, height: 864 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  for (const count of [1, 10, 50]) {
    await page.goto(`${FE}/sales/invoices/new`, { waitUntil: 'networkidle' });
    const editor = page.getByTestId('line-items-editor');
    await editor.waitFor({ timeout: 30000 });
    if ((await page.getByRole('radio', { name: 'Walk-in' }).getAttribute('aria-checked')) !== 'true') {
      await page.getByRole('radio', { name: 'Walk-in' }).click();
    }
    let keys = 0;
    const press = async (key) => {
      keys += 1;
      await page.keyboard.press(key);
    };
    const type = async (text) => {
      keys += text.length;
      await page.keyboard.type(text);
    };
    let expected = 0;
    let tabs = 0;
    const started = Date.now();
    for (let i = 0; i < count; i += 1) {
      const item = items[i];
      const qty = 1 + (i % 3);
      expected += Number(item.price) * qty;
      if (i > 0) {
        await press('Alt+n');
      } else {
        await page.getByRole('combobox', { name: lineLabel('Item', 1) }).focus();
      }
      const combo = page.getByRole('combobox', { name: lineLabel('Item', i + 1) });
      await combo.waitFor({ timeout: 5000 });
      await press('Enter');
      await type(item.code);
      await page.getByRole('option', { name: new RegExp(item.code) }).first().waitFor({ timeout: 10000 });
      await press('Enter');
      await page.waitForFunction(
        (n) => [...document.querySelectorAll('[role="combobox"]')].some((el) => el.getAttribute('aria-label')?.toLowerCase() === `item, line ${n}` && el.textContent?.includes('Kirana')),
        i + 1,
        { timeout: 10000 },
      ).catch(async (error) => {
        await page.screenshot({ path: `${ROOT}/${size}-${count}-stuck-line-${i + 1}.png` });
        throw new Error(`${size} ${count} lines: line ${i + 1} (${item.code}) was not picked — ${error.message}`);
      });
      const qtyBox = page.getByLabel(lineLabel('Qty', i + 1));
      // The caret goes on to Qty by itself after a pick; poll briefly, as a person's next key would land.
      const inQty = await page.waitForFunction((el) => el === document.activeElement, await qtyBox.elementHandle(), { timeout: 1000 }).then(() => true, () => false);
      if (!inQty) {
        tabs += 1;
        await press('Tab');
      }
      await press('Control+a');
      await type(String(qty));
    }
    const entered = Date.now();
    // What the form holds, line by line, against what was keyed — a lost key names its line.
    const held = await page.evaluate(() => {
      const rows = [];
      for (let n = 1; ; n += 1) {
        const item = [...document.querySelectorAll('[role="combobox"]')].find((el) => el.getAttribute('aria-label')?.toLowerCase() === `item, line ${n}`);
        if (!item) break;
        const qty = [...document.querySelectorAll('input')].find((el) => el.getAttribute('aria-label')?.toLowerCase() === `qty, line ${n}`);
        rows.push({ item: item.textContent?.trim() ?? '', qty: qty?.value ?? '' });
      }
      return rows;
    });
    const wrong = held
      .map((row, i) => ({ ...row, line: i + 1, want: items[i] ? { item: `Kirana item ${items[i].code}`, qty: String(1 + (i % 3)) } : null }))
      .filter((row) => !row.want || row.item !== row.want.item || row.qty !== row.want.qty);
    check(`${size} ${count} lines: every line holds the item and quantity keyed`, held.length === count && wrong.length === 0,
      `${held.length} lines; ${JSON.stringify(wrong.slice(0, 5))}`);
    const shown = (await page.getByTestId('invoice-grand-total').filter({ visible: true }).first().innerText().catch(() => '')).replace(/[^\d.]/g, '');
    await press('Control+Enter');
    const confirm = page.getByTestId('invoice-payment-confirm');
    await confirm.waitFor({ timeout: 15000 });
    await confirm.click();
    keys += 1;
    const issuedDialog = page.getByRole('dialog').filter({ hasText: /INV\// });
    await issuedDialog.waitFor({ timeout: 30000 });
    const issuedAt = Date.now();
    const number = (await issuedDialog.innerText()).match(/INV\/[\w-]+\/\d+/)?.[0];
    const list = await must('GET', '/sales/invoices?page_size=100', null, tok);
    const invoice = (list.results ?? list).find((row) => row.number === number);
    const detail = invoice ? await must('GET', `/sales/invoices/${invoice.id}`, null, tok) : null;
    const server = Number(detail?.grand_total ?? detail?.data?.grand_total ?? NaN);
    const rounded = Math.round(expected);
    const row = {
      size, lines: count, keys, keysPerLine: +(keys / count).toFixed(1),
      secondsToEnter: +((entered - started) / 1000).toFixed(1),
      secondsPerLine: +((entered - started) / 1000 / count).toFixed(2),
      secondsToIssued: +((issuedAt - started) / 1000).toFixed(1),
      expected: rounded.toFixed(2), shown, server: Number.isNaN(server) ? null : server.toFixed(2), number,
    };
    results.push(row);
    console.log(JSON.stringify(row));
    check(`${size} ${count} lines: the caret moved to Qty after every pick`, tabs === 0, `${tabs} Tab presses needed`);
    check(`${size} ${count} lines: the server's total is the sum keyed`, row.server === row.expected, `${row.server} vs ${row.expected}`);
    check(`${size} ${count} lines: the editor showed that total before Issue`, Number(shown).toFixed(2) === row.expected, `${shown}`);
    await page.screenshot({ path: `${ROOT}/${size}-${count}-issued.png` });
  }
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
writeFileSync(`${ROOT}/timing.json`, JSON.stringify(results, null, 2));
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
