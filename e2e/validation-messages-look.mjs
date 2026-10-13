#!/usr/bin/env node
/** QA B15: useful format errors, refreshed dependent fields, and one collection refusal. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { api, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/validation-messages-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};
const user = await newUser();
const tenant = await must('POST', '/tenants', {
  name: `Validation Book ${uniq()}`, state_code: '27', business_type: 'retail',
  apps: ['shop', 'library', 'lending'],
}, user.token);
user.token = tenant.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const today = new Date().toISOString().slice(0, 10);
const next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const loan = await must('POST', '/lending/loans', {
  plan_type: 'fixed_daily', principal: '1200.00', frequency: 'daily', instalment_count: 10,
  per_instalment_amount: '120.00', collection_weekdays: 127, disbursed_on: today, first_due_on: next,
  party: { name: 'Validation Borrower', mobile: uniqMobile() },
}, user.token);
const refusal = await api('POST', `/lending/loans/${loan.id}/collections/preview`, { amount: '5000.00' }, user.token);
const refusalMessage = refusal.body.error?.message;
if (!refusalMessage) throw new Error('The overpayment preview must be refused');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(user.email);
    await page.locator('input[type=password]').fill(user.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    const snapshot = async (name) => {
      record(`${width} ${name} fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
    };

    await page.goto(`${frontend}/library/settings`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Change', exact: true }).first().click();
    await page.getByLabel('Next number', { exact: true }).fill('abc');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(250);
    let text = await page.getByRole('dialog').innerText();
    record(`${width} nonnumeric counter says Enter a number`, text.includes('Enter a number.'), text.replace(/\s+/g, ' '));
    await snapshot('counter');

    await page.goto(`${frontend}/library/catalogue`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add book', exact: true }).first().click();
    await page.getByLabel('ISBN', { exact: true }).fill('12345');
    await page.getByLabel('ISBN', { exact: true }).press('Tab');
    await page.waitForTimeout(250);
    text = await page.getByRole('dialog').innerText();
    record(`${width} short ISBN says 10 or 13 digits`, text.includes('ISBN must have 10 or 13 digits.'), text.replace(/\s+/g, ' ').slice(0, 350));
    await snapshot('isbn');

    await page.goto(`${frontend}/customers`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Add (customer|party)/i }).first().click();
    await page.getByRole('button', { name: 'GST and address', exact: true }).click();
    await page.getByLabel('GSTIN', { exact: true }).fill('ABC123');
    await page.getByLabel('GSTIN', { exact: true }).press('Tab');
    await page.waitForTimeout(250);
    text = await page.getByRole('dialog').innerText();
    record(`${width} short GSTIN says 15 characters`, text.includes('GSTIN must be 15 characters.'), text.replace(/\s+/g, ' ').slice(-400));
    await snapshot('gstin');

    await page.goto(`${frontend}/library/seats`, { waitUntil: 'networkidle' });
    await page.getByTestId('library-seats-setup').click();
    await page.getByLabel('From', { exact: true }).fill('10');
    await page.getByLabel('To', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Add seats', exact: true }).click();
    await page.getByText('The last number is before the first.', { exact: true }).waitFor();
    await page.getByLabel('From', { exact: true }).fill('1');
    await page.waitForTimeout(300);
    record(`${width} correcting From clears the dependent error`, await page.getByText('The last number is before the first.', { exact: true }).count() === 0);
    await snapshot('seats');

    await page.goto(`${frontend}/lending/loans/${loan.id}`, { waitUntil: 'networkidle' });
    await page.getByTestId('lending-loan-collect').click();
    await page.getByLabel('Amount received', { exact: true }).fill('5000');
    await page.getByRole('dialog').getByText(refusalMessage, { exact: true }).waitFor();
    await page.getByTestId('lending-collect-save').click();
    await page.waitForTimeout(400);
    const count = await page.getByRole('dialog').getByText(refusalMessage, { exact: true }).count();
    record(`${width} overpayment refusal appears once`, count === 1, `${count} copies`);
    await snapshot('collection');
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
