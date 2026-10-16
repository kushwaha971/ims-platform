#!/usr/bin/env node
/**
 * WP-03 D-04c — the "say why" dialog after the void, cancel and reverse
 * dialogs became one. On a live stack, a synthetic shop with one customer and
 * one khata entry, at a 360 px phone and a 1280 laptop, reversing the entry:
 *   * the dialog opens with the caret in the reason, and nothing red on it;
 *   * "Reverse entry" is not greyed: pressed with no reason it says why under
 *     the field and sends nothing;
 *   * with a reason it reverses, the dialog closes, and the balance is back
 *     to zero on the server.
 * Nothing is sent to anybody. Screenshots go to /tmp/e2e-shots/reason-dialog.
 *
 *   node e2e/reason-dialog-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/reason-dialog';
mkdirSync(ROOT, { recursive: true });
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const email = `reason-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Reason Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Kirana', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['phone-360', { width: 360, height: 780 }], ['laptop-1280', { width: 1280, height: 800 }]]) {
  const party = await must('POST', '/parties', { name: `Ramesh Traders ${size}`, is_customer: true, state_code: '27' }, tok);
  await must('POST', `/parties/${party.id}/ledger-entries`, { entry_date: TODAY, direction: 'debit', amount: '500.00', note: 'Cement bags' }, tok);
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let reversals = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && /\/reverse\b/.test(r.url())) reversals += 1; });
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/khata`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
  await page.goto(`${FE}/parties/${party.id}`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'More actions for Cement bags' }).first().click();
  const sheet = page.getByRole('dialog').filter({ hasText: 'Correct' });
  await sheet.waitFor();
  await sheet.getByRole('button', { name: /^Reverse/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Reverse this entry?' });
  await dialog.waitFor();
  await page.waitForTimeout(400);
  const reason = dialog.getByLabel(/^Reason/);
  check(`${size}: the caret is in the reason`, await reason.evaluate((el) => el === document.activeElement));
  check(`${size}: nothing is red before anything is typed`, (await reason.getAttribute('aria-invalid')) !== 'true');
  const confirm = dialog.getByRole('button', { name: 'Reverse entry' });
  check(`${size}: "Reverse entry" is not greyed`, await confirm.isEnabled());
  await page.screenshot({ path: `${ROOT}/${size}-open.png` });
  await confirm.click();
  await page.waitForTimeout(400);
  check(`${size}: an empty reason says why and sends nothing`, (await reason.getAttribute('aria-invalid')) === 'true' && reversals === 0, `reversals=${reversals}`);
  await page.screenshot({ path: `${ROOT}/${size}-says-why.png` });
  await reason.fill('Typed for the wrong customer');
  await confirm.click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  const after = await must('GET', `/parties/${party.id}`, undefined, tok);
  const balance = (after.data ?? after).balance;
  check(`${size}: the reversal went through and the balance is back to zero`, reversals === 1 && Number(balance) === 0, `reversals=${reversals} balance=${balance}`);
  await page.screenshot({ path: `${ROOT}/${size}-done.png` });
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
