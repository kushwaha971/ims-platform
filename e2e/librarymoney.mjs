// Library P0 — expenses and the profit view on a live stack.
//
// Seeds a reading room with one student who paid ₹900 and one who did not, and a ₹1,200
// rent expense, then at 1280 and 390 px: the library menu offers "Income & expenses" and
// "Expenses"; the Expenses page keeps the LIBRARY menu (not the shop's); the money page
// shows ₹900 in, ₹1,200 out and "Short by ₹300.00". Photographs into /tmp/e2e-shots/librarymoney.
//
//   node e2e/librarymoney.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/librarymoney';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `moneyqa-${uniq()}@e2e.test`;
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
const plan = await must('POST', '/library/membership-types', { name: 'Monthly', fee_amount: '900.00', validity_months: 1 }, tok);
const paid = await must('POST', '/parties', { name: 'Rahul Sharma', is_customer: true, mobile: '9876500011', state_code: '27' }, tok);
await must('POST', '/library/members', { membership_type_id: plan.id, party_id: paid.id, collect_fees: { mode_breakup: [{ mode: 'upi', amount: '900.00' }] } }, tok);
const owing = await must('POST', '/parties', { name: 'Imran Khan', is_customer: true, mobile: '9876500012', state_code: '27' }, tok);
await must('POST', '/library/members', { membership_type_id: plan.id, party_id: owing.id }, tok);
const cats = await must('GET', '/expense-categories', null, tok);
const rent = (cats.find?.((c) => /rent/i.test(c.name)) ?? cats[0]);
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
await must('POST', '/expenses', { amount: '1200.00', expense_date: today, category_id: rent.id, mode: 'cash' }, tok);
const sums = await must('GET', '/library/profit', null, tok);
check('the server: 900 in, 1,200 out, 300 short', sums.income_total === '900.00' && sums.expenses_total === '1200.00' && sums.profit === '-300.00', JSON.stringify(sums));

const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  cut: Array.from(document.querySelectorAll('main p, main span'))
    .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
    .filter((node) => !node.className.toString().includes('sr-only'))
    .filter((node) => node.scrollWidth - node.clientWidth > 1)
    .map((node) => (node.textContent ?? '').trim())
    .slice(0, 6),
}));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (name) => {
    await page.waitForTimeout(1200);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/library/money`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('library-money-out').waitFor({ timeout: 30000 });
  const text = await page.locator('main').innerText();
  check(`${size}: 900 in, 1,200 out, short by 300`, text.includes('₹900.00') && text.includes('₹1,200.00') && text.includes('Short by') && text.includes('₹300.00'), text.slice(0, 400));
  await look('money');
  if (size === 'desktop') {
    const nav = await page.locator('nav').first().innerText();
    check('the library menu lists Income & expenses and Expenses', nav.includes('Income & expenses') && nav.includes('Expenses'), nav.slice(0, 300));
    await page.getByTestId('library-money-expenses').click();
    await page.waitForURL((u) => u.pathname === '/expenses', { timeout: 20000 });
    await page.waitForTimeout(2500);
    const menu = await page.locator('nav').first().innerText();
    check('the Expenses page keeps the library menu', menu.includes('Students') || menu.includes('Seats') || menu.includes('Income & expenses'), menu.slice(0, 300));
    check('and no shop menu', !menu.includes('Purchase orders') && !menu.includes('Delivery challans'), menu.slice(0, 300));
    check('no Cashbook in the library', !(await page.locator('main').innerText()).includes('Cashbook'));
    await look('expenses');
  }
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
