#!/usr/bin/env node
/** QA B9: a student's library fee must never appear as money in the Shop. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/library-book-look';
mkdirSync(out, { recursive: true });
const owner = await newUser({ name: 'Book Owner' });
const tenant = await must('POST', '/tenants', {
  name: `Separate Books ${uniq()}`, business_type: 'retail', state_code: '27',
  apps: ['shop', 'library'],
}, owner.token);
owner.token = tenant.access_token ?? owner.token;
for (const step of [2, 3, 4]) {
  await must('PATCH', '/tenants/current', { onboarding_step: step }, owner.token);
}
const student = await addParty(owner.token, {
  name: 'Library Only Student', mobile: uniqMobile(),
  opening_balance_amount: '250.00', opening_balance_direction: 'debit',
  opening_balance_as_of: new Date().toISOString().slice(0, 10),
});
const plan = await must('POST', '/library/membership-types', {
  name: 'Reading plan', validity_months: 1, fee_amount: '900.00',
}, owner.token);
await must('POST', '/library/members', {
  membership_type_id: plan.id, party_id: student.id,
}, owner.token);
const detail = await must('GET', `/parties/${student.id}`, null, owner.token);
assert.equal(detail.balance, '250.00', 'the opening balance exists in the Udhaar book');
assert.equal(detail.shop_balance, '0.00', 'the Shop owes none of the library fee or opening balance');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(owner.email);
    await page.locator('input[type=password]').fill(owner.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(`${frontend}/customers`, { waitUntil: 'networkidle' });
    await page.getByText(student.name, { exact: true }).first().click();
    await page.waitForURL(`**/parties/${student.id}`);
    await page.waitForLoadState('networkidle');
    await page.getByText('No bills or payments yet', { exact: true }).waitFor();
    // The switch-app response can reset cached detail after the first paint.
    await page.waitForTimeout(1000);
    await page.getByText('No bills or payments yet', { exact: true }).waitFor();
    const text = await page.locator('body').innerText();
    assert.ok(text.includes(student.name), 'the Shop opens the actual student');
    assert.ok(!text.includes('900.00'), 'the library fee is absent from the Shop');
    assert.ok(!text.includes('250.00'), 'the other book’s opening balance is absent from the Shop');
    assert.ok(!/You gave|You got|Library dues/.test(text), 'Shop money uses only its own labels');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/${width}-shop-student.png`, fullPage: true });
    console.log(`PASS ${width}: library fees absent from Shop; page fits; no browser errors`);
    await context.close();
  }
} finally {
  await browser.close();
}
