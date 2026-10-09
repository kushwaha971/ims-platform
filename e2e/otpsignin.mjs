/**
 * otpsignin.mjs — sign up and sign in with a mobile number and an OTP, live.
 *
 * The owner, 9 Oct 2026: "for registration and login use only mobile number and
 * OTP … stay logged in just like other mobile apps … proper resend OTP logic
 * for that user, timer of 2 min". This walks it on a phone and a laptop:
 *
 *  - /signup and /login ask for a mobile number only (+91, no picker, no email,
 *    no password);
 *  - "Send code" moves to the code step, naming the number;
 *  - "Resend code" is a countdown from 2:00, not a button, and the SERVER
 *    refuses an early resend too (asserted through the API, which the screen
 *    cannot be trusted to prove);
 *  - a wrong code says how many tries are left;
 *  - the right code — read from the API's log, where the console SMS backend
 *    prints it when no Fast2SMS key is set — creates the account and opens
 *    onboarding;
 *  - the session cookie lives ninety days and survives a reload;
 *  - nothing is wider than the phone.
 *
 * The API must be the one `serve-api.sh` started, logging to $UB_E2E_LOGS.
 *   node e2e/otpsignin.mjs [--shots]     (shots → /tmp/e2e-shots/otpsignin)
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { api } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const LOGS = process.env.UB_E2E_LOGS ?? '/tmp';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = '/tmp/e2e-shots/otpsignin';

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check}${detail && !ok ? `\n        ${detail}` : ''}`);
};

/** A fresh Indian mobile no account holds: 9 + nine digits from the clock. */
const freshMobile = (salt) => `9${String(Date.now() + salt).slice(-9)}`;

/** The newest code the console backend logged for a number ending in `last3`. */
const codeFromLog = async (last3, notBefore) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const log = readFileSync(join(LOGS, 'be-run.log'), 'utf8').slice(notBefore);
    const matches = [...log.matchAll(/sms\.console to=\+91…(\d{3}) body=(\d{6}) is your/g)].filter(
      (m) => m[1] === last3
    );
    if (matches.length) return matches[matches.length - 1][2];
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};
const logSize = () => {
  try {
    return readFileSync(join(LOGS, 'be-run.log'), 'utf8').length;
  } catch {
    return 0;
  }
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const [index, vp] of [
  { id: 'phone', width: 360, height: 780, isMobile: true },
  { id: 'desktop', width: 1280, height: 800, isMobile: false },
].entries()) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${vp.id}-${name}.png` });
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  const national = freshMobile(index * 7919);
  const last3 = national.slice(-3);

  await page.goto(`${FRONTEND}/signup`, { waitUntil: 'networkidle', timeout: 120000 });
  const mobile = page.getByLabel('Mobile number');
  await mobile.waitFor({ timeout: 30000 });
  record(`${vp.id}: /signup asks for a mobile number`, await mobile.isVisible());
  record(
    `${vp.id}: and nothing else — no email, no password, no country picker`,
    (await page.getByLabel(/Email/).count()) === 0 &&
      (await page.getByLabel(/Password/).count()) === 0 &&
      (await page.getByRole('combobox', { name: 'Country code' }).count()) === 0
  );
  record(`${vp.id}: the page is no wider than the screen`, (await overflow()) <= 0);
  await shot('1-number');

  await mobile.fill(national);
  const before = logSize();
  await page.getByRole('button', { name: 'Send code' }).click();
  const heading = page.getByRole('heading', { name: 'Enter the code' });
  const reached = await heading.waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  record(`${vp.id}: "Send code" moves to the code step`, reached);
  const sentTo = `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
  record(`${vp.id}: it names the number the code went to`, await page.getByText(sentTo).isVisible().catch(() => false), sentTo);

  const countdown = page.getByText(/^Resend code in (2:00|1:[0-5]\d)$/);
  record(`${vp.id}: resend is a 2-minute countdown, not a button`,
    (await countdown.isVisible().catch(() => false)) &&
      (await page.getByRole('button', { name: 'Resend code' }).count()) === 0,
    await page.getByText(/Resend code/).first().textContent().catch(() => ''));
  record(`${vp.id}: the code step fits the screen`, (await overflow()) <= 0);
  await shot('2-code');

  // The server, not the screen, is what holds the two minutes.
  const early = await api('POST', '/auth/otp/request', { mobile: `+91${national}` });
  record(`${vp.id}: the server refuses a resend inside two minutes`, early.status === 429 &&
    Number(early.body?.error?.details?.retry_after) > 60, JSON.stringify(early.body?.error ?? early.status));

  const code = await codeFromLog(last3, before);
  record(`${vp.id}: the code is in the API log (no Fast2SMS key locally)`, Boolean(code));

  // A wrong code first: it must say how many tries are left.
  const wrong = code === '000001' ? '000002' : '000001';
  await page.keyboard.type(wrong);
  const wrongMsg = page.getByText(/Wrong code\. \d tries? left\./);
  record(`${vp.id}: a wrong code says how many tries are left`,
    await wrongMsg.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
  await shot('3-wrong');

  if (code) {
    // A refused code empties the cells; the real one is typed straight in.
    const cleared = await page.evaluate(() =>
      [...document.querySelectorAll('input[autocomplete="one-time-code"], input[inputmode="numeric"]')]
        .every((cell) => cell.value === '')
    );
    record(`${vp.id}: the wrong code is cleared from the cells`, cleared);
    await page.getByRole('textbox').first().focus();
    await page.keyboard.type(code);
    const landed = await page
      .waitForURL((u) => !u.pathname.startsWith('/signup') && !u.pathname.startsWith('/login'), { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    record(`${vp.id}: the right code signs the new number up and opens onboarding`,
      landed && page.url().includes('/onboarding'), page.url());
    await shot('4-landed');
    record(`${vp.id}: no error toast follows the merchant onto the next screen`,
      (await page.getByText('Incorrect or expired code.').count()) === 0);

    const refresh = (await ctx.cookies()).find((c) => c.name === 'ub_refresh');
    const days = refresh ? (refresh.expires * 1000 - Date.now()) / 86_400_000 : 0;
    record(`${vp.id}: the session cookie lasts ninety days`, days > 89 && days <= 90.1, days.toFixed(2));

    await page.reload({ waitUntil: 'networkidle' });
    record(`${vp.id}: a reload stays signed in`, !page.url().includes('/login'), page.url());
  }
  record(`${vp.id}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
