#!/usr/bin/env node
/**
 * e2e/offline.mjs — QA B50: the installed app's second launch works without signal.
 *
 * Signs in on a 360 px phone, opens the dashboard and a khata while online (the
 * service worker caches the pages, the static files and the last API reads), then
 * cuts the network and opens both again. The checks read what the merchant SEES:
 * the business's own data on screen, not the browser's offline page.
 *
 * Needs a production build served by e2e/serve.sh with NEXT_PUBLIC_SW_ENABLED=true.
 */
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const user = await newUser({ name: 'Offline Owner' });
const shopName = `Offline Shop ${uniq()}`;
const t = await must('POST', '/tenants', { name: shopName, business_type: 'retail', state_code: '27' }, user.token);
user.token = t.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const ramesh = await must('POST', '/parties', { name: 'Ramesh Offline', is_customer: true }, user.token);
await must('POST', '/ledger-entries', { party_id: ramesh.id, direction: 'debit', amount: '750.00', entry_date: new Date().toISOString().slice(0, 10) }, user.token);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
const page = await ctx.newPage();
await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"], input[name="email"]', user.email);
await page.fill('input[type="password"], input[name="password"]', user.password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});

const controlled = await page
  .waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
record('the service worker is installed and controls the page', controlled);

// Online visits: the worker learns the business, then keeps these pages and reads.
for (const path of ['/dashboard', '/khata', `/parties/${ramesh.id}`]) {
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}
const hydrated = await page.evaluate(() => document.documentElement.dataset.hydrated);
record('the page marks itself live once React has hydrated', hydrated === 'true');

await ctx.setOffline(true);
for (const [path, expect] of [['/dashboard', 'To collect'], [`/parties/${ramesh.id}`, '₹750.00']]) {
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  const text = await page.innerText('body').catch(() => '');
  record(`offline, ${path} opens with the last data`, text.includes(expect), text.replace(/\s+/g, ' ').slice(0, 160));
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall offline checks passed');
process.exit(failed ? 1 : 0);
