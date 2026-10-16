#!/usr/bin/env node
/**
 * WP-03 D-05 — the last grams of a return are returnable. On a live stack, at
 * 360 and 1280 px: an invoice of 0.300 KG of turmeric, a credit note already
 * taking 0.100 back, then "Return items" again:
 *   * the line says "up to 0.2", not 0.19999999999999998;
 *   * typing 0.2 is accepted and Issue is allowed;
 *   * typing 0.25 is refused with "Only 0.2 can be returned";
 *   * no page overflow, no page errors.
 * Floats made 0.3 − 0.1 = 0.19999999999999998, so the cap refused exactly what
 * was left. Nothing is issued from the browser. Screenshots go to
 * /tmp/e2e-shots/quantity-return.
 *
 *   node e2e/quantity-return-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/quantity-return';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

const email = `qtyret-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Return QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Masala Stores', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const kg = (await must('GET', '/units', null, tok)).find((u) => u.code === 'KGS');
const haldi = await must('POST', '/items', {
  name: 'Turmeric powder', unit_id: kg.id, selling_price: '400.00', tax_code: 'GST5', hsn_sac: '0910',
  purchase_price: '300.00', opening_stock: { qty: '5', unit_cost: '300.00' },
}, tok);
const party = await must('POST', '/parties', { name: 'Meena Joshi', is_customer: true, state_code: '27' }, tok);
let r = await api('POST', '/sales/invoices?issue=true', {
  party_id: party.id, document_date: TODAY, due_on: TODAY, lines: [{ item_id: haldi.id, qty: '0.300' }],
}, tok);
check('seed: invoice of 0.300 KG', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 200)}`);
const invoice = r.body.data;
const line = invoice.lines[0];
r = await api('POST', '/sales/credit-notes', {
  against_id: invoice.id, party_id: party.id, document_date: TODAY, reason: 'sales_return', restock: true,
  lines: [{ item_id: haldi.id, qty: '0.100', against_line_id: line.id }],
}, tok);
check('seed: first return of 0.100 KG', r.status < 300, `${r.status}`);
r = await api('POST', `/sales/credit-notes/${r.body.data.id}/issue`, {}, tok);
check('seed: first return issued', r.status < 300, `${r.status}`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['phone', { width: 360, height: 780 }], ['desktop', { width: 1280, height: 860 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (name) => {
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${size} ${name}: fits the screen`, over <= 0, `${over}px`);
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };

  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  await page.goto(`${FE}/sales/credit-notes/new?against=${invoice.id}`, { waitUntil: 'networkidle' });
  const lines = page.getByTestId('credit-note-lines');
  await lines.waitFor({ timeout: 30000 });
  const said = await lines.innerText();
  check(`${size}: the line offers what is left`, /0\.2\b/.test(said) && !said.includes('0.1999'), JSON.stringify(said.slice(0, 160)));
  const qty = lines.getByRole('textbox').first();
  await qty.fill('0.2');
  await qty.blur();
  await page.waitForTimeout(400);
  const after = await lines.innerText();
  check(`${size}: 0.2 KG is accepted`, !/can be returned/.test(after), JSON.stringify(after.slice(0, 200)));
  await look('exact-cap');

  await qty.fill('0.25');
  await qty.blur();
  await page.waitForTimeout(400);
  const refused = await lines.innerText();
  check(`${size}: 0.25 KG is refused in plain words`, refused.includes('Only 0.2 can be returned'), JSON.stringify(refused.slice(0, 200)));
  check(`${size}: and the noise is gone`, !refused.includes('0.1999'));
  await look('over-cap');
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
