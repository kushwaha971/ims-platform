#!/usr/bin/env node
/**
 * e2e/renew-look.mjs — QA B5 on a live stack, at 360 and 1280 px.
 *
 *  · A student on the free "Standard" plan (no end date): no Renew, a Change plan
 *    button instead; the API refuses a renew with a 409 that says why.
 *  · Change plan moves them to Monthly; Renew appears, and its dialog says
 *    "Adds ₹900.00 · valid till …" before it is pressed.
 *  · Nothing wider than the screen.
 */
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const API = process.env.E2E_API ?? 'http://localhost:8000/api/v1';
const OUT = process.argv[2] ?? '/tmp/renew-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const fits = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} fits the screen`, over <= 0, `${over}px`);
};

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const user = await newUser({ name: 'Room Owner' });
  const t = await must('POST', '/tenants', { name: `Reading Room ${uniq()}`, state_code: '27', apps: ['library'] }, user.token);
  user.token = t.access_token ?? user.token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
  const types = await must('GET', '/library/membership-types', null, user.token);
  const standard = types.find((x) => x.validity_months === null);
  await must('POST', '/library/membership-types', { name: 'Monthly', validity_months: 1, fee_amount: '900.00' }, user.token);
  const party = await addParty(user.token, { name: 'Free Student', mobile: uniqMobile() });
  const enrolled = await must('POST', '/library/members', { membership_type_id: standard.id, party_id: party.id }, user.token);
  const id = enrolled.membership_id;

  const raw = await fetch(`${API}/library/members/${id}/renew`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': uniq() },
    body: '{}',
  });
  const refusal = await raw.json();
  record(`${w}: the API refuses a renew on a plan with no end, in words`, raw.status === 409 && /Change the plan/.test(refusal.error?.message ?? ''), `${raw.status} ${refusal.error?.message ?? ''}`);

  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});

  await page.goto(`${FRONTEND}/library/members/${id}`, { waitUntil: 'networkidle' });
  await page.getByTestId('library-member-number').waitFor();
  await page.screenshot({ path: `${OUT}/${w}-free.png`, fullPage: true });
  record(`${w}: no Renew on a plan with no end date`, (await page.getByTestId('library-member-renew').count()) === 0);
  record(`${w}: Change plan is offered instead`, (await page.getByTestId('library-member-change-plan').count()) === 1);
  await fits(page, `${w}: student page`);

  await page.getByTestId('library-member-change-plan').click();
  await page.getByRole('combobox', { name: 'New plan' }).waitFor();
  await page.getByLabel(/^Reason/).fill('Starts paying monthly');
  await page.screenshot({ path: `${OUT}/${w}-change-plan.png`, fullPage: false });
  await fits(page, `${w}: change plan dialog`);
  await page.getByTestId('library-member-confirm').click();
  await page.getByTestId('library-member-renew').waitFor({ timeout: 15000 }).catch(() => {});
  record(`${w}: after moving to Monthly, Renew appears`, (await page.getByTestId('library-member-renew').count()) === 1);
  // Monthly was chosen after the student joined, so the page has no end date yet
  // until the next renewal sets one; open the dialog only when Renew is there.
  if (await page.getByTestId('library-member-renew').count()) {
    await page.getByTestId('library-member-renew').click();
    const preview = await page.getByTestId('library-renew-preview').innerText().catch(() => '');
    record(`${w}: the renew dialog says what it adds and until when`, /Adds ₹900\.00 · valid till \d\d\/\d\d\/\d{4}/.test(preview), preview);
    await page.screenshot({ path: `${OUT}/${w}-renew.png`, fullPage: false });
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall renew checks passed');
process.exit(failed ? 1 : 0);
