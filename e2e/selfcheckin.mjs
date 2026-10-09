// Library P0 — QR self check-in on a live stack.
//
// Seeds a reading room with one student, then: the desk opens Attendance → "Check-in QR"
// (the dialog and the printed poster are photographed); the student opens the poster's
// link on a 390 px phone with no session, types a wrong number (one "could not find
// you"), then the right number and the last four of their mobile, and is welcomed by
// first name; scanning again says "already checked in"; the desk's register shows them
// in. Photographs into /tmp/e2e-shots/selfcheckin.
//
//   node e2e/selfcheckin.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/selfcheckin';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `checkinqa-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Pay QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Vidya Reading Room', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const py = path.join(REPO, 'backend/.venv/bin/python');
execFileSync(py, ['manage.py', 'shell', '-c', `
from apps.platform_app.models.membership import Membership
t = Membership.objects.select_related('tenant').get(user__email='${email}', role__code='owner').tenant
for row, field in ((t.plan, 'modules'), (t.partner, 'allowed_modules')):
    setattr(row, field, sorted(set(getattr(row, field) or []) | {'library'})); row.save(update_fields=[field])
t.enabled_modules = sorted(set(t.enabled_modules or []) | {'library'}); t.save(update_fields=['enabled_modules'])
`], { cwd: path.join(REPO, 'backend'), env: { ...process.env, UB_UNRELEASED_MODULES: '1' } });
const plan = await must('POST', '/library/membership-types', { name: 'Monthly' }, tok);
const party = await must('POST', '/parties', { name: 'Rahul Sharma', is_customer: true, mobile: '9876500011', state_code: '27' }, tok);
const member = await must('POST', '/library/members', { membership_type_id: plan.id, party_id: party.id }, tok);
const number = member.member_number ?? member.number;
const poster = await must('GET', '/library/checkin-poster', null, tok);
const FORBIDDEN = ['digikhaato', 'yourkhata', 'udhaarbook'];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

// The desk.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-IN' });
  const page = await ctx.newPage();
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/library/attendance`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('library-checkin-open').click({ timeout: 30000 });
  await page.getByTestId('library-checkin-qr').waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${ROOT}/desk-dialog.png` });
  // While the print dialog is up, the poster must be on the page and our dialog gone.
  await page.evaluate(() => {
    window.print = () => {
      window.__atPrint = {
        poster: !!document.querySelector('[data-testid="library-checkin-poster"]'),
        dialog: !!document.querySelector('[data-testid="library-checkin-qr"]'),
      };
    };
  });
  await page.getByTestId('library-checkin-print').click();
  const atPrint = await page.evaluate(() => window.__atPrint);
  check('printing shows the poster and not the dialog', atPrint && atPrint.poster && !atPrint.dialog, JSON.stringify(atPrint));
  const sheet = await page.getByTestId('library-checkin-poster').innerText();
  check('the poster names the library and says how', sheet.includes('Vidya Reading Room') && sheet.includes('Scan to check in'), sheet.slice(0, 200));
  await ctx.close();
}

// The student's phone, no session.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const path_ = new URL(poster.url).pathname;
  await page.goto(`${FE}${path_}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Vidya Reading Room').waitFor({ timeout: 30000 });
  check('the page is not sent to login', new URL(page.url()).pathname === path_, page.url());
  await page.getByLabel('Student number').fill('NOPE-1');
  await page.getByLabel('Last 4 digits of your mobile').fill('0011');
  await page.getByTestId('self-checkin-submit').click();
  await page.getByText('We could not find you').waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${ROOT}/phone-not-found.png` });
  await page.getByLabel('Student number').fill(String(number));
  await page.getByTestId('self-checkin-submit').click();
  const done = page.getByTestId('self-checkin-done');
  await done.waitFor({ timeout: 20000 });
  check('the student is welcomed by first name', (await done.innerText()).includes('Welcome, Rahul'), await done.innerText());
  await page.screenshot({ path: `${ROOT}/phone-welcome.png` });
  const html = (await page.content()).toLowerCase();
  check('nothing of the product on the page', FORBIDDEN.every((w) => !html.includes(w)));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('Student number').fill(String(number));
  await page.getByLabel('Last 4 digits of your mobile').fill('0011');
  await page.getByTestId('self-checkin-submit').click();
  await page.getByTestId('self-checkin-done').waitFor({ timeout: 20000 });
  check('a second scan says already', (await page.getByTestId('self-checkin-done').innerText()).includes('already checked in'));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
const day = await must('GET', '/library/attendance', null, tok);
const rows = day.rows ?? day.data ?? day;
check('the desk register shows the student in', JSON.stringify(rows).includes('Rahul'), JSON.stringify(day).slice(0, 300));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
