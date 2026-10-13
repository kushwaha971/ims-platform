#!/usr/bin/env node
/**
 * e2e/books-look.mjs — DEC-019's two books, side by side, at 360 and 1280 px.
 *
 * One business running the Shop and the Udhaar book, one person with ₹500 of
 * udhaar and nothing on bills. It opens the Udhaar book's list and khata, then
 * the Shop's Customers, the same person from the Shop, the Shop's statement and
 * the Shop's home, prints what each says and how far it overflows, and saves a
 * screenshot of each into the directory given as the first argument.
 *
 * Its first run found four things no unit test had: /khata titled "Customers",
 * the Shop home's tiles still saying "You will get", the Shop home's activity
 * feed showing the udhaar "You gave", and "Back to khata" on the Shop's statement.
 *
 *   node e2e/books-look.mjs /tmp/books-look
 */
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2];
const user = await newUser({ name: 'Look Owner' });
const t = await must('POST', '/tenants', { name: `Look Shop ${uniq()}`, business_type: 'retail', state_code: '27', apps: ['shop', 'khata'] }, user.token);
user.token = t.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, mobile: '9876500011' }, user.token);
await must('POST', '/ledger-entries', { party_id: ramesh.id, direction: 'debit', amount: '500.00', entry_date: new Date().toISOString().slice(0, 10), note: 'Cement bags' }, user.token);
const me = await must('GET', '/auth/me', null, user.token);
console.log('apps', JSON.stringify(me.apps?.map((a) => a.code)), 'modules', JSON.stringify(me.enabled_modules?.filter((m) => ['khata', 'sales'].includes(m))));

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 860]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', user.email);
  await page.fill('input[type="password"], input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const go = async (path, name) => {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${OUT}/${w}-${name}.png`, fullPage: true });
    const text = (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 400);
    console.log(`${w} ${name} overflow=${over}px :: ${text}`);
  };
  await go('/khata', 'khata-list');
  await go(`/parties/${ramesh.id}`, 'khata-person');
  await go('/customers', 'shop-customers');
  await go(`/parties/${ramesh.id}`, 'shop-person');
  await go(`/parties/${ramesh.id}/statement?book=shop`, 'shop-statement');
  await go('/dashboard', 'shop-home');
  if (errors.length) console.log('PAGE ERRORS', errors);
  await ctx.close();
}
await browser.close();
