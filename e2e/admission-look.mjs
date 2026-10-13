#!/usr/bin/env node
/**
 * e2e/admission-look.mjs — QA F1/F2: the library admission drawer in both modes, at
 * 360 and 1280 px: every payment mode offered with its real words (the chips once
 * printed raw message ids), nothing wider than the screen, and the existing-student
 * switch trading "Collect now" for joined / paid till / security / old dues. What the
 * server records for each is `backend/apps/library/tests/test_admission_existing.py`.
 * Screenshots into the directory given.
 */
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/admission-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const user = await newUser({ name: 'Room Owner' });
const t = await must('POST', '/tenants', { name: `Reading Room ${uniq()}`, state_code: '27', apps: ['library'] }, user.token);
user.token = t.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
await must('POST', '/library/membership-types', { name: 'Monthly', validity_months: 1, fee_amount: '1500.00', admission_fee: '200.00', deposit_amount: '500.00' }, user.token).catch(() => null);

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});
  await page.goto(`${FRONTEND}/library/members`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New admission/ }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${w}-new.png`, fullPage: true });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${w}: the drawer fits the screen`, over <= 0, `${over}px`);
  const text = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: every Take-fee mode is offered`, ['Cash', 'PhonePe', 'Google Pay', 'Bank', 'Cheque', 'Card'].every((m) => text.includes(m)), ['Cash', 'PhonePe', 'Google Pay', 'Bank', 'Cheque', 'Card'].filter((m) => !text.includes(m)).join(', ') + ' missing');

  await page.getByRole('switch', { name: /Existing student/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${w}-existing.png`, fullPage: true });
  const ex = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: existing student asks joined, paid till, security and old dues`, ['Joined on', 'Paid till', 'Security already taken', 'Old dues'].every((s) => ex.includes(s)));
  record(`${w}: and no longer offers to collect money`, !ex.includes('Collect now'));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall admission checks passed');
process.exit(failed ? 1 : 0);
