#!/usr/bin/env node
/**
 * e2e/lending-migrate-look.mjs — QA F8 / B45 at 360 and 1280 px against a live stack.
 *
 *  · New loan: "Loan already running" swaps "Money given by" for what was already
 *    collected, says nothing moves today's cash, and the save button stops saying
 *    "Give ₹…".
 *  · A loan given 80 days ago with 60 of 100 instalments paid (made through the API):
 *    its page shows the history as "Collected before", no receipt, and late days.
 *  · Collect: a "Collected on" date, today by default.
 *  · Business days: adding a closure says loan collections move.
 *  · Nothing wider than the screen.
 */
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/lending-migrate-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const fits = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} fits the screen`, over <= 0, `${over}px`);
};
const iso = (d) => d.toISOString().slice(0, 10);

const user = await newUser({ name: 'Money Lender' });
const t = await must('POST', '/tenants', { name: `Lender ${uniq()}`, state_code: '27', apps: ['lending'] }, user.token);
user.token = t.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const today = new Date();
const given = new Date(today.getTime() - 80 * 86400000);
const firstDue = new Date(given.getTime() + 86400000);
const loan = await must('POST', '/lending/loans', {
  plan_type: 'fixed_daily', principal: '10000.00', frequency: 'daily', instalment_count: 100,
  per_instalment_amount: '100.00', disbursed_on: iso(given), first_due_on: iso(firstDue),
  party: { name: 'Geeta Devi', mobile: '9820011223' }, payment_mode: 'cash',
  existing: { instalments_collected: 60 },
}, user.token);
record('API: 60 of 100 collected, 4,000 left', loan.collected === '6000.00' && loan.remaining === '4000.00', `${loan.collected} / ${loan.remaining}`);
record('API: late days run from the 61st instalment', loan.days_past_due > 0 && loan.days_past_due < 25, `${loan.days_past_due} days`);

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});

  // ── the form ──
  await page.goto(`${FRONTEND}/lending/loans/new`, { waitUntil: 'networkidle' });
  await page.getByRole('switch', { name: /Loan already running/ }).click();
  await page.getByTestId('lending-existing').waitFor();
  await page.getByTestId('lending-existing').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${w}-form.png`, fullPage: true });
  const body = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: the form asks what was already collected`, body.includes('Instalments already paid') && body.includes('Nothing is added to today'));
  record(`${w}: and no longer asks how the money is given`, !body.includes('Money given by'));
  record(`${w}: the save button does not say Give`, !/Give ₹/.test(body));
  await fits(page, `${w}: new loan form`);

  // ── the loan ──
  await page.goto(`${FRONTEND}/lending/loans/${loan.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${w}-loan.png`, fullPage: true });
  const loanText = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: the history reads Collected before`, loanText.includes('Collected before (from old book)'), loanText.slice(0, 0));
  record(`${w}: with no raw id and no receipt to print`, !loanText.includes('lending.mode') && (await page.getByTestId('lending-loan-print-receipt').count()) === 0);
  await fits(page, `${w}: loan page`);

  // ── collect ──
  await page.getByRole('button', { name: /^Collect/ }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${w}-collect.png`, fullPage: true });
  const dialog = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: Collect asks the day it was collected`, dialog.includes('Collected on'));
  await page.keyboard.press('Escape');

  // ── business days ──
  await page.goto(`${FRONTEND}/settings/business-days`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add closure' }).click();
  const note = await page.getByTestId('calendar-moves-loans').innerText().catch(() => '');
  await page.screenshot({ path: `${OUT}/${w}-closure.png`, fullPage: true });
  record(`${w}: a closure says loan collections move`, note.includes('next collection day'), note.slice(0, 60));
  await fits(page, `${w}: closure dialog`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall lending checks passed');
process.exit(failed ? 1 : 0);
