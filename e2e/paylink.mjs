// Shop P0 — the UPI pay link on a live stack.
//
// Seeds a lender with a UPI ID and one running loan, then:
//   * on the loan page, taps "UPI QR" — the dialog must draw the QR for what is due,
//     with Share QR and Copy link;
//   * the borrower's reminder text carries a /pay/ link;
//   * that link opens the pay page at 390 and 1280 px: the lender's name, the amount,
//     "Pay ₹… by UPI" pointing at upi://pay with that amount, the QR, and nothing of
//     the product;
//   * an edited link shows the expired screen.
// Every screen is measured and photographed into /tmp/e2e-shots/paylink.
//
//   node e2e/paylink.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/paylink';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `payqa-${uniq()}@e2e.test`;
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

// ── The reminder carries the link ───────────────────────────────────────────
const sheet = await must('GET', `/lending/loans/${loan.id}/message/reminder`, null, tok);
const link = (sheet.text.match(/https?:\/\/\S+\/pay\/\S+/) ?? [])[0];
check('the reminder text carries a pay link', !!link, sheet.text);
const token = link ? link.split('/pay/')[1] : 'none';

// ── The screens ─────────────────────────────────────────────────────────────
const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  cut: Array.from(document.querySelectorAll('main p, main span, main div, main h1, [role="dialog"] p, [role="dialog"] span'))
    .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
    .filter((node) => !node.className.toString().includes('sr-only'))
    .filter((node) => node.scrollWidth - node.clientWidth > 1)
    .map((node) => (node.textContent ?? '').trim())
    .slice(0, 6),
}));
const FORBIDDEN = ['digikhaato', 'yourkhata', 'udhaarbook'];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (name) => {
    await page.waitForTimeout(1200);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: false });
  };

  // The payer's page, with no session.
  await page.goto(`${FE}/pay/${token}`, { waitUntil: 'domcontentloaded' });
  const button = page.getByTestId('public-pay-upi');
  await button.waitFor({ timeout: 30000 });
  const href = await button.getAttribute('href');
  const body = await page.locator('main').innerText();
  check(`${size}: the page names the lender and the sum`, body.includes('Verma Finance') && /₹\s?[\d,]+\.\d\d/.test(body), body.slice(0, 200));
  check(`${size}: the button opens UPI with the amount`, /^upi:\/\/pay\?pa=verma\.finance@okaxis&.*am=\d+\.\d\d/.test(href ?? ''), href);
  const html = (await page.content()).toLowerCase();
  check(`${size}: nothing of the product on the page`, FORBIDDEN.every((w) => !html.includes(w)), '');
  await look('pay-page');
  await page.goto(`${FE}/pay/${token.replace(/_\d/, '_9')}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('This link has expired').waitFor({ timeout: 20000 });
  await look('pay-expired');

  // The desk's QR on the loan page.
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/lending/loans/${loan.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('lending-loan-upi-qr').click({ timeout: 30000 });
  await page.getByTestId('pay-link-qr').waitFor({ timeout: 20000 });
  const dialog = await page.getByRole('dialog').innerText();
  check(`${size}: the desk QR shows the sum and the UPI ID`, dialog.includes('verma.finance@okaxis') && /₹[\d,]+\.\d\d/.test(dialog), dialog.slice(0, 200));
  check(`${size}: Share QR and Copy link are offered`, (await page.getByTestId('pay-link-share').count()) === 1 && (await page.getByTestId('pay-link-copy').count()) === 1);
  await look('desk-qr');
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
