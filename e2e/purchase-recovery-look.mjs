// SH-011 / ADR-063 — a purchase bill's first save whose reply is LOST must not
// make a second draft. On a live stack, at 1280 and 390 px:
//   * opens /purchases/bills/new and picks a supplier (which saves at once);
//   * lets that first POST reach the server, then drops its reply, so the
//     server has a draft the browser never heard about;
//   * presses Save draft — the retry carries the same creation key, gets the
//     original draft back, and saves today's typing onto it;
//   * reads the SERVER: exactly one purchase draft, with this supplier.
// Every screen is measured and photographed into /tmp/e2e-shots/purchase-recovery.
//
//   node e2e/purchase-recovery-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/purchase-recovery';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}));

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  // A fresh business per size, so the count of drafts is this run's alone.
  const email = `purrecqa-${uniq()}@e2e.test`;
  let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Purchase QA Owner' })).access_token;
  const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Traders', business_type: 'retail', state_code: '27' }, tok);
  tok = ten.access_token ?? tok;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
  await must('POST', '/parties', { name: 'Agro Wholesale', is_supplier: true, is_customer: false, state_code: '27' }, tok);

  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (name) => {
    await page.waitForTimeout(1200);
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow <= 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };

  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  // The first create reaches the server; its reply never reaches the page.
  const posts = [];
  let dropped = false;
  await page.route('**/api/v1/purchases/bills', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    posts.push(request.postDataJSON());
    if (!dropped) {
      dropped = true;
      await route.fetch();
      return route.abort('connectionreset');
    }
    return route.continue();
  });

  await page.goto(`${FE}/purchases/bills/new`, { waitUntil: 'domcontentloaded' });
  const supplier = page.locator('main').getByRole('combobox').first();
  await supplier.waitFor({ timeout: 30000 });
  await look('new');
  await supplier.click();
  await page.getByRole('option', { name: /Agro Wholesale/ }).first().click();
  await page.waitForTimeout(2500);
  check(`${size}: the supplier pick sent a first save`, posts.length === 1, `${posts.length}`);
  await look('lost-reply');

  // Retry by hand. On the phone Save lives in the dock under the total.
  await page.getByRole('button', { name: /Save draft/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(3000);
  check(`${size}: the retry reused the creation key`,
    posts.length >= 2 && !!posts[0]?.client_draft_key && posts[1]?.client_draft_key === posts[0]?.client_draft_key,
    JSON.stringify(posts.map((p) => p.client_draft_key)));
  await look('after-retry');

  const drafts = await api('GET', '/purchases/bills?tab=draft', null, tok);
  const rows = drafts.body.data ?? [];
  check(`${size}: the server holds ONE draft bill`, rows.length === 1, `${rows.length}`);
  check(`${size}: it is this supplier's`, rows[0]?.party?.name === 'Agro Wholesale' || JSON.stringify(rows[0] ?? {}).includes('Agro Wholesale'));
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
