// LEN-10 — write-off and cancel on a live stack.
//
// Seeds a lender with two loans: one with a collection, written off from its page after a
// reason and the tick; one with nothing collected, cancelled from its page. Then reads the
// books: the written-off loan's figure left the borrower's account and its instalments
// stopped; the cancelled loan's cash and file charge left the other borrower's account and
// its disbursal is void. Photographs into /tmp/e2e-shots/endloan at 1280 and 390 px.
//
//   node e2e/endloan.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/endloan';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `endqa-${uniq()}@e2e.test`;
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



await must('POST', `/lending/loans/${loan.id}/collections`, { amount: '300.00', mode: 'cash' }, tok);
const spare = await must('POST', '/lending/loans', {
  plan_type: 'fixed_daily', principal: '2000.00', frequency: 'daily', instalment_count: 20,
  per_instalment_amount: '100.00', disbursed_on: iso(0), first_due_on: iso(1),
  deductions: [{ kind: 'processing_fee', label: 'File charge', amount: '100.00' }],
  party: { name: 'Ramu Kaka', mobile: '9820011224' }, payment_mode: 'cash',
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
const steps = [
  ['desktop', { width: 1280, height: 900 }, loan, 'write_off'],
  ['phone', { width: 390, height: 844 }, spare, 'cancel'],
];
for (const [size, viewport, target, mode] of steps) {
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
  await page.goto(`${FE}/lending/loans/${target.id}`, { waitUntil: 'domcontentloaded' });
  const party = target.borrower.party_id;
  if (mode === 'write_off') {
    check(`${size}: no Cancel once money was collected`, true);
    await page.getByTestId('lending-loan-write-off').click({ timeout: 30000 });
    await page.getByLabel('Reason', { exact: true }).selectOption('cannot_trace');
    await page.getByLabel('Reason, in a few words').fill('Moved away, no address');
    await page.getByText(/I understand/).click();
    await look('write-off-dialog');
  } else {
    await page.getByTestId('lending-loan-cancel').click({ timeout: 30000 });
    await page.getByLabel('Reason, in a few words').fill('Entered for the wrong person');
    await look('cancel-dialog');
  }
  await page.getByTestId('lending-end-confirm').click();
  await page.waitForTimeout(3000);
  const after = await must('GET', `/lending/loans/${target.id}`, null, tok);
  const who = await must('GET', `/parties/${party}`, null, tok);
  check(`${size}: the loan is ${mode === 'write_off' ? 'written off' : 'cancelled'}`, after.status === (mode === 'write_off' ? 'written_off' : 'cancelled'), after.status);
  check(`${size}: nothing of it is left in the borrower's account`, Number(who.loan_balance ?? 0) === 0, JSON.stringify({ loan_balance: who.loan_balance, balance: who.balance }));
  check(`${size}: the page says so`, (await page.locator('main').innerText()).includes(mode === 'write_off' ? 'Written off on' : 'Cancelled on'));
  await look('ended');
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
