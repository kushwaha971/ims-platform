// Lending P0 — the loan papers on a live stack.
//
// Seeds a lender (address and phone set) with a running loan and one UPI collection,
// and a second loan paid off in one go, then on the loan pages: prints the receipt,
// the statement and the closure letter (window.print is stubbed), photographs each
// under print media into /tmp/e2e-shots/papers, and reads what is on the paper.
//
//   node e2e/papers.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/papers';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `papersqa-${uniq()}@e2e.test`;
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
  per_instalment_amount: '100.00', disbursed_on: iso(-3), first_due_on: iso(-2),
  party: { name: 'Geeta Devi', mobile: '9820011223' }, payment_mode: 'cash',
}, tok);


await must('PATCH', '/tenants/current', { address: { line1: '12 Station Road', city: 'Indore', pincode: '452001' }, phone: '+919820011223' }, tok);
await must('POST', `/lending/loans/${loan.id}/collections`, { amount: '300.00', mode: 'upi', reference: 'UTR123' }, tok);
// A second loan, paid off in one go, for the closure letter.
const paid = await must('POST', '/lending/loans', {
  plan_type: 'fixed_daily', principal: '1000.00', frequency: 'daily', instalment_count: 10,
  per_instalment_amount: '100.00', disbursed_on: iso(-3), first_due_on: iso(-2),
  party: { name: 'Ramu Kaka', mobile: '9820011224' }, payment_mode: 'cash',
}, tok);
await must('POST', `/lending/loans/${paid.id}/collections`, { amount: '1000.00', mode: 'cash' }, tok);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-IN' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 120000 });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

const shoot = async (name, testId) => {
  await page.locator(`[data-testid="${testId}"]`).waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(800);
  check(`${name}: the print dialog was asked for`, (await page.evaluate(() => window.__printed ?? 0)) > 0);
  await page.emulateMedia({ media: 'print' });
  const text = await page.locator(`[data-testid="${testId}"]`).innerText();
  await page.screenshot({ path: `${ROOT}/${name}.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.__printed = 0; });
  return text;
};
await page.goto(`${FE}/lending/loans/${loan.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('lending-loan-print-receipt').first().click({ timeout: 30000 });
const receipt = await shoot('receipt', 'loan-paper-receipt');
check('receipt: lender letterhead and the collection', receipt.includes('Verma Finance') && receipt.includes('12 Station Road') && receipt.includes('Received ₹300.00') && receipt.includes('UTR123'), receipt.slice(0, 400));
check('receipt: no product name', !/yourkhata|digikhaato/i.test(receipt));
await page.getByTestId('lending-loan-print-statement').click();
const statement = await shoot('statement', 'loan-paper-statement');
check('statement: terms, instalments and the payment', statement.includes('Loan statement') && statement.includes('Total to repay') && statement.includes('₹300.00'), statement.slice(0, 300));
check('no closure letter for a running loan', (await page.getByTestId('lending-loan-print-closure').count()) === 0);
await page.goto(`${FE}/lending/loans/${paid.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('lending-loan-print-closure').click({ timeout: 30000 });
const closure = await shoot('closure', 'loan-paper-closure');
check('closure: no dues for the paid loan', closure.includes('No dues certificate') && closure.includes('Ramu Kaka') && closure.includes('Nothing is due'), closure.slice(0, 400));
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
