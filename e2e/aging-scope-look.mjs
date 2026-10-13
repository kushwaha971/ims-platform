#!/usr/bin/env node
/** QA B36: Old dues' selected headline must equal its filtered age buckets. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { addParty, api, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';
const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/aging-scope-look';
mkdirSync(out, { recursive: true });
const user = await newUser();
const business = await must('POST', '/tenants', {
  name: `Aging Scope ${uniq()}`, state_code: '27', business_type: 'retail', apps: ['shop', 'lending', 'khata'],
}, user.token);
user.token = business.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const ago = (days) => new Date(new Date(`${today}T12:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10);
const older = await addParty(user.token, { name: 'Older Debt', mobile: uniqMobile(),
  opening_balance_amount: '250.00', opening_balance_direction: 'debit', opening_balance_as_of: ago(40) });
await addParty(user.token, { name: 'Recent Debt', opening_balance_amount: '750.00',
  opening_balance_direction: 'debit', opening_balance_as_of: ago(5) });
await must('POST', '/lending/loans', { plan_type: 'fixed_daily', principal: '120.00',
  frequency: 'daily', instalment_count: 10, per_instalment_amount: '12.00',
  collection_weekdays: 127, disbursed_on: today, first_due_on: ago(-1),
  party_id: older.id }, user.token);
const summary = await must('GET', '/ledger/summary', null, user.token);
assert.equal(summary.receivable, '1000.00', 'loan money stays out of this book');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium' });
let failed = false;
try {
 for (const width of [1280, 360]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${frontend}/login/email`);
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill(user.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  for (const [name, query, amount] of [['today', '', '1,000.00'], ['historical', `?as_of=${ago(20)}`, '250.00']]) {
   await page.goto(`${frontend}/ledger/aging${query}`, { waitUntil: 'networkidle' });
   await page.getByRole('tab', { name: /You will get/ }).waitFor();
   await page.waitForTimeout(500);
   const tab = await page.getByRole('tab', { name: /You will get/ }).innerText();
   const response = await api('GET', `/ledger/aging${query}`, null, user.token);
   assert.equal(response.status, 200);
   const amounts = response.body.meta.totals;
   const cents = (value) => Math.round(Number(value) * 100);
   assert.equal(cents(amounts.total), ['0_30', '31_60', '61_90', '90_plus'].reduce((sum, key) => sum + cents(amounts[key]), 0));
   assert.equal(cents(amounts.total), response.body.data.reduce((sum, row) => sum + cents(row.total), 0));
   // The visible figure must match the same as-of question, not today's cache.
   await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
   try { assert.ok(tab.includes(amount), `${name}: expected ₹${amount}, saw ${tab}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []); console.log(`PASS ${width} ${name}: headline scoped to report; fits; no errors`);
   } catch (error) { failed = true; console.log(`FAIL ${width} ${name}: ${error.message}`); }
  }
  await context.close();
 }
} finally { await browser.close(); }
if (failed) process.exitCode = 1;
