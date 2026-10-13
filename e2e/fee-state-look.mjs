#!/usr/bin/env node
/**
 * e2e/fee-state-look.mjs — QA B26 on a live stack, at 360 and 1280 px.
 *
 *  · New admission: the plan starts empty; saving without one says "Choose a plan."
 *  · "How is this student paying?" — Collect now / Pay later / Already paid on a fee
 *    plan; New student / Already paid on a ₹0 plan.
 *  · Badges: a ₹0 plan reads "No fee" (never "Paid"), part of a fee "Part paid",
 *    nothing paid "Fee unpaid", the whole fee "Paid till {date}".
 *  · Nothing wider than the screen.
 */
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/fee-state-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const fits = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} fits the screen`, over <= 0, `${over}px`);
};

const user = await newUser({ name: 'Room Owner' });
const t = await must('POST', '/tenants', { name: `Reading Room ${uniq()}`, state_code: '27', apps: ['library'] }, user.token);
user.token = t.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const monthly = await must('POST', '/library/membership-types', { name: 'Monthly', validity_months: 1, fee_amount: '900.00' }, user.token);
// A new library is seeded with a free "Standard" plan — the very one the QA report
// admitted students on. Use it, or make one if seeding ever stops.
const types = await must('GET', '/library/membership-types', null, user.token);
const free =
  types.find((x) => Number(x.fee_amount) === 0 && Number(x.admission_fee ?? 0) === 0) ??
  (await must('POST', '/library/membership-types', { name: 'Free plan', fee_amount: '0.00' }, user.token));
console.log(`free plan: ${free.name} ₹${free.fee_amount}, deposit ₹${free.deposit_amount}`);

const admit = async (name, typeId, extra = {}) => {
  const party = await addParty(user.token, { name, mobile: uniqMobile() });
  return must('POST', '/library/members', { membership_type_id: typeId, party_id: party.id, ...extra }, user.token);
};
await admit('Free Student', free.id);
await admit('Part Payer', monthly.id, { collect_fees: { mode_breakup: [{ mode: 'cash', amount: '400.00' }] } });
await admit('No Payer', monthly.id);
await admit('Full Payer', monthly.id, { collect_fees: { mode_breakup: [{ mode: 'cash', amount: '900.00' }] } });

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
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${w}-list.png`, fullPage: true });
  const list = (await page.getByTestId('library-members-screen').innerText()).replace(/\s+/g, ' ');
  const near = (name) => list.slice(list.indexOf(name), list.indexOf(name) + 120);
  record(`${w}: a ₹0 plan reads No fee, never Paid`, near('Free Student').includes('No fee') && !/\bPaid\b/.test(near('Free Student').split(/Part Payer|No Payer|Full Payer/)[0]), near('Free Student'));
  record(`${w}: part of the fee reads Part paid`, near('Part Payer').includes('Part paid'), near('Part Payer'));
  record(`${w}: nothing paid reads Fee unpaid`, near('No Payer').includes('Fee unpaid'), near('No Payer'));
  record(`${w}: the whole fee reads Paid till a date (the table shows it under Plan till)`, w < 768 ? /Paid till \d\d\/\d\d\/\d{4}/.test(near('Full Payer')) : /Plan till \d\d\/\d\d\/\d{4}.*Paid/.test(near('Full Payer')), near('Full Payer'));
  await fits(page, `${w}: students list`);

  await page.getByTestId('library-member-add').click();
  await page.waitForTimeout(500);
  const planBox = page.getByLabel('Plan', { exact: true });
  record(`${w}: the plan starts empty`, (await planBox.inputValue()) === '');
  await page.getByLabel(/^Name/).first().fill('New Admission');
  await page.getByTestId('library-enrol-save').click();
  await page.waitForTimeout(400);
  const drawer = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: saving without a plan says Choose a plan.`, drawer.includes('Choose a plan.'));
  await planBox.selectOption(monthly.id);
  await page.waitForTimeout(300);
  const chips = await page.getByRole('radio').allInnerTexts();
  record(`${w}: a fee plan asks how the student pays`, ['Collect now', 'Pay later', 'Already paid (old student)'].every((c) => chips.some((x) => x.includes(c))), chips.join(' | '));
  await page.getByText('How is this student paying?').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${w}-drawer-fee.png`, fullPage: false });
  await fits(page, `${w}: admission drawer`);
  await planBox.selectOption(free.id);
  await page.waitForTimeout(300);
  const freeChips = await page.getByRole('radio').allInnerTexts();
  record(`${w}: a ₹0 plan offers New student or Already paid`, freeChips.some((x) => x.includes('New student')) && !freeChips.some((x) => x.includes('Collect now')), freeChips.join(' | '));
  await page.screenshot({ path: `${OUT}/${w}-drawer-free.png`, fullPage: false });
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall fee-state checks passed');
process.exit(failed ? 1 : 0);
