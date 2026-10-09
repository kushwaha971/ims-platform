// LEN-09 — late fees and waivers on a live stack.
//
// Seeds a lender with a loan whose terms carry ₹10 a day after 1 day of grace (cap ₹50),
// two instalments already late, then at 1280 and 390 px: opens the loan, adds the late
// fee the rule suggests from the instalment's "Late fee" button, waives it again from
// "Waive", and checks the instalment and the borrower's figures after each; then opens
// the new-loan form and photographs its late-fee terms. Into /tmp/e2e-shots/latefees.
//
//   node e2e/latefees.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/latefees';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `feeqa-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Pay QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Verma Finance', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
await must('PATCH', '/tenants/current', { upi_vpa: 'verma.finance@okaxis' }, tok);
const py = path.join(REPO, 'backend/.venv/bin/python');
execFileSync(py, ['manage.py', 'shell', '-c', `
from apps.platform_app.models.membership import Membership
t = Membership.objects.select_related('tenant').get(user__email='${email}', role__code='owner').tenant
for row, field in ((t.plan, 'modules'), (t.partner, 'allowed_modules')):
    setattr(row, field, sorted(set(getattr(row, field) or []) | {'lending'})); row.save(update_fields=[field])
t.enabled_modules = sorted(set(t.enabled_modules or []) | {'lending'}); t.save(update_fields=['enabled_modules'])
`], { cwd: path.join(REPO, 'backend'), env: { ...process.env, UB_UNRELEASED_MODULES: '1' } });
const loan = await must('POST', '/lending/loans', {
  plan_type: 'fixed_daily', principal: '10000.00', frequency: 'daily', instalment_count: 100,
  per_instalment_amount: '100.00', disbursed_on: iso(-4), first_due_on: iso(-3),
  late_fee_kind: 'per_day', late_fee_value: '10.00', late_fee_cap: '50.00', late_fee_grace_days: 1,
  party: { name: 'Geeta Devi', mobile: '9820011223' }, payment_mode: 'cash',
}, tok);



const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  cut: Array.from(document.querySelectorAll('main p, main span, [role="dialog"] p, [role="dialog"] span, [role="dialog"] label'))
    .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
    .filter((node) => !node.className.toString().includes('sr-only'))
    .filter((node) => node.scrollWidth - node.clientWidth > 1)
    .map((node) => (node.textContent ?? '').trim())
    .slice(0, 6),
}));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let pass = 0;
for (const [size, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  pass += 1;
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (name) => {
    await page.waitForTimeout(1000);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: false });
  };
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/lending/loans/${loan.id}`, { waitUntil: 'domcontentloaded' });
  const before = await must('GET', `/lending/loans/${loan.id}`, null, tok);
  // Each pass takes its own instalment: pass 1 the first (3 days ago), pass 2 the second.
  const n = pass - 1;
  const lateDays = 2 - n;
  await page.getByTestId('lending-due-late-fee').nth(n).click({ timeout: 30000 });
  await page.getByTestId('lending-adjust-so-far').waitFor({ timeout: 20000 });
  const soFar = await page.getByTestId('lending-adjust-so-far').innerText();
  // First instalment: due 3 days ago, 1 day of grace → 2 days × ₹10.
  check(`${size}: the rule's figure is offered`, soFar.includes(`₹${lateDays * 10}.00`) && soFar.includes(`days late: ${lateDays}`), soFar);
  await look('late-fee-dialog');
  await page.getByTestId('lending-adjust-save').click();
  await page.waitForTimeout(2500);
  const after = await must('GET', `/lending/loans/${loan.id}`, null, tok);
  check(`${size}: the fee is on the instalment and in what is late`, after.schedule[n].late_fee === `${lateDays * 10}.00` && Number(after.arrears) === Number(before.arrears) + lateDays * 10, `${after.schedule[n].late_fee} ${before.arrears}→${after.arrears}`);
  await page.getByTestId('lending-due-waive').nth(n).click();
  await page.getByTestId('lending-adjust-save').waitFor({ timeout: 20000 });
  await page.getByLabel('Reason').fill('First time, paid the same week');
  await look('waive-dialog');
  await page.getByTestId('lending-adjust-save').click();
  await page.waitForTimeout(2500);
  const waived = await must('GET', `/lending/loans/${loan.id}`, null, tok);
  check(`${size}: the waiver takes the fee off again`, waived.schedule[n].waived === `${lateDays * 10}.00` && waived.arrears === before.arrears, `${waived.schedule[n].waived} ${waived.arrears}`);
  await look('instalments');
  await page.goto(`${FE}/lending/loans/new`, { waitUntil: 'domcontentloaded' });
  const terms = page.getByTestId('lending-late-fee-terms');
  await terms.waitFor({ timeout: 30000 });
  await terms.locator('select').selectOption('per_day');
  await terms.scrollIntoViewIfNeeded();
  await look('new-loan-late-fee');
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
