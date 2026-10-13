#!/usr/bin/env node
/** QA B12: paying tomorrow's instalments is collected money, never today's debt. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { api, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/lending-advance-look';
mkdirSync(out, { recursive: true });
const user = await newUser();
const tenant = await must('POST', '/tenants', {
  name: `Advance Book ${uniq()}`, state_code: '27', apps: ['lending'],
}, user.token);
user.token = tenant.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const tomorrow = new Date(`${today}T12:00:00Z`);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const loan = await must('POST', '/lending/loans', {
  plan_type: 'fixed_daily', principal: '120.00', frequency: 'daily', instalment_count: 10,
  per_instalment_amount: '12.00', collection_weekdays: 127, disbursed_on: today,
  first_due_on: tomorrow.toISOString().slice(0, 10),
  party: { name: 'Advance Borrower', mobile: uniqMobile() },
}, user.token);
await must('POST', `/lending/loans/${loan.id}/collections`, { amount: '36.00', mode: 'cash' }, user.token);
const round = await api('GET', '/lending/today', null, user.token);
assert.equal(round.status, 200);
assert.equal(round.body.meta.due, '0.00', 'advance-only day has nothing to collect');
assert.equal(round.body.meta.collected, '36.00');
assert.equal(round.body.meta.short, '0.00');

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(user.email);
    await page.locator('input[type=password]').fill(user.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    for (const [path, name] of [['/lending', 'today'], ['/lending/borrowers', 'borrowers']]) {
      await page.goto(`${frontend}${path}`, { waitUntil: 'networkidle' });
      await page.getByText('Advance Borrower', { exact: true }).first().waitFor();
      if (name === 'today' || width === 1280) {
        await page.getByRole('button', { name: 'Details', exact: true }).click();
        const dueCard = page.getByText('To collect today', { exact: true }).locator('xpath=../..');
        assert.ok((await dueCard.innerText()).includes('₹0.00'), 'headline shows zero due');
        const paidCard = page.getByText(name === 'today' ? 'Collected' : 'Collected today', { exact: true }).locator('xpath=../..');
        assert.ok((await paidCard.innerText()).includes('₹36.00'), `advance stays under Collected: ${await paidCard.innerText()}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
      console.log(`PASS ${width} ${name}: advance is collected, not due; page fits`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
