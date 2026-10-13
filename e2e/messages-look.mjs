#!/usr/bin/env node
/**
 * e2e/messages-look.mjs — QA F4 / B51: messaging any student, one or a group, at 360
 * and 1280 px, against a live stack. Asserts what the merchant gets rather than what
 * the controls look like:
 *
 *  · a PAID student's menu offers the plan end date and "Send your own message";
 *  · the plan-end text carries the real date, and a custom text comes back with the
 *    student's own name in place of {name};
 *  · "Message a group → Fee unpaid" prepares one message per unpaid student, each
 *    with that student's own figure, and nobody who has paid;
 *  · opening one records it, and the student's "Messages sent" log then shows it;
 *  · nothing on any of those screens is wider than the viewport.
 *
 * WhatsApp itself is not opened: wa.me is routed to an empty page. Screenshots go to
 * the directory given.
 */
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/messages-look';
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
const plan = await must('POST', '/library/membership-types', { name: 'Monthly', validity_months: 1, fee_amount: '900.00' }, user.token);
const admit = async (name, paid) => {
  const party = await addParty(user.token, { name, mobile: uniqMobile() });
  const body = { membership_type_id: plan.id, party_id: party.id };
  if (paid) body.collect_fees = { mode_breakup: [{ mode: 'cash', amount: paid }] };
  return must('POST', '/library/members', body, user.token);
};
const asha = await admit('Asha Paid', '900.00');
await admit('Bina Part', '300.00');
await admit('Chetan Unpaid', null);

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'whatsapp' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`   ! ${e.message}`));
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});

  // ── one paid student ──
  await page.goto(`${FRONTEND}/library/members/${asha.membership_id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${w}-menu.png` });
  const menu = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: a paid student is offered the plan end date and their own message`, menu.includes('Send plan end date') && menu.includes('Send your own message'));
  await page.getByRole('menuitem', { name: 'Send plan end date' }).click().catch(async () => page.getByText('Send plan end date').click());
  await page.getByTestId('library-message-send').waitFor({ timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${w}-plan-end.png` });
  const planText = (await page.getByTestId('library-message').innerText()).replace(/\s+/g, ' ');
  record(`${w}: the plan-end message says the date`, /ends on \d\d\/\d\d\/\d{4}/.test(planText), planText.slice(0, 90));
  await fits(page, `${w}: plan-end dialog`);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.getByText('Send your own message').click();
  await page.getByRole('textbox').fill('Hi {name}, the room is closed on Sunday.');
  await page.getByTestId('library-message-prepare').click();
  await page.getByTestId('library-message-send').waitFor({ timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${w}-custom.png` });
  const customText = await page.getByTestId('library-message').innerText();
  record(`${w}: the custom message has the student's own name`, customText.includes('Hi Asha, the room is closed on Sunday.'), customText.slice(0, 90));
  await fits(page, `${w}: custom dialog`);
  await page.getByTestId('library-message-send').click();
  await page.waitForTimeout(1500);
  for (const p of ctx.pages()) if (p !== page) await p.close();
  // The log was already on the page ("No message sent yet"); wait for the refetch.
  await page.getByTestId('library-message-log').getByText('closed on Sunday').first().waitFor({ timeout: 10000 }).catch(() => {});
  const log = await page.getByTestId('library-message-log').innerText({ timeout: 5000 }).catch(async () =>
    `[no log card; at ${page.url()}; log cards: ${await page.getByTestId("library-message-log").count()}]`);
  record(`${w}: the send is in the student's log`, log.includes('Your own message') && log.includes('closed on Sunday'), log.replace(/\s+/g, ' ').slice(0, 120));
  await page.getByTestId('library-message-log').scrollIntoViewIfNeeded().catch(() => {});
  await page.getByTestId('library-message-log').screenshot({ path: `${OUT}/${w}-log.png` }).catch(() => {});

  // ── a group ──
  await page.goto(`${FRONTEND}/library/messages`, { waitUntil: 'networkidle' });
  await page.getByTestId('library-bulk-open').click();
  await page.getByTestId('library-bulk-prepare').waitFor();
  await page.screenshot({ path: `${OUT}/${w}-bulk-form.png` });
  await fits(page, `${w}: group form`);
  await page.getByTestId('library-bulk-prepare').click();
  await page.getByTestId('library-bulk-rows').waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${w}-bulk-rows.png`, fullPage: true });
  const rows = (await page.getByTestId('library-bulk-rows').innerText()).replace(/\s+/g, ' ');
  record(`${w}: fee unpaid prepares one message each, with their own amount`,
    rows.includes('Bina Part') && rows.includes('Rs 600.00') && rows.includes('Chetan Unpaid') && rows.includes('Rs 900.00') && !rows.includes('Asha Paid'),
    rows.slice(0, 160));
  record(`${w}: two messages ready`, /2 messages ready/.test(rows));
  await fits(page, `${w}: group messages`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall message checks passed');
process.exit(failed ? 1 : 0);
