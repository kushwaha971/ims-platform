// SH-011 / ADR-063 — the sales bill's twin of purchase-recovery-look.mjs. On a
// live stack, at 1280 and 390 px: open /sales/invoices/new for a wholesale shop
// (customer mode), pick a customer, let the autosave's first POST reach the
// server and drop its reply, then press Save draft. The retry must carry the
// same creation key and the server must hold exactly ONE draft bill.
// Every screen is measured and photographed into /tmp/e2e-shots/sales-recovery.
//
//   node e2e/sales-recovery-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/sales-recovery';
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
  const email = `salrecqa-${uniq()}@e2e.test`;
  let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Sales QA Owner' })).access_token;
  const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Traders', business_type: 'wholesale', state_code: '27' }, tok);
  tok = ten.access_token ?? tok;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
  await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27' }, tok);

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

  const posts = [];
  let dropped = false;
  await page.route('**/api/v1/sales/invoices', async (route) => {
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

  await page.goto(`${FE}/sales/invoices/new`, { waitUntil: 'domcontentloaded' });
  const customer = page.locator('main').getByRole('combobox').first();
  await customer.waitFor({ timeout: 30000 });
  await look('new');
  await customer.click();
  await page.getByRole('option', { name: /Ramesh Traders/ }).first().click();
  // The sales editor autosaves 3 s after a customer is picked.
  await page.waitForTimeout(6000);
  check(`${size}: the autosave sent a first save and lost its reply`, posts.length === 1 && dropped, `${posts.length}`);
  await look('lost-reply');

  await page.getByRole('button', { name: /Save draft/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(4000);
  const keys = posts.map((p) => p.client_draft_key);
  check(`${size}: the retry reused the creation key`, keys.length >= 2 && !!keys[0] && keys.every((k) => k === keys[0]), JSON.stringify(keys));
  check(`${size}: the editor moved to the draft's own address`, /\/sales\/invoices\/[0-9a-f-]{36}\/edit$/.test(new URL(page.url()).pathname), page.url());
  await look('after-retry');

  const drafts = (await api('GET', '/sales/invoices?tab=draft', null, tok)).body.data ?? [];
  check(`${size}: the server holds ONE draft bill`, drafts.length === 1, `${drafts.length}`);
  check(`${size}: it is this customer's`, JSON.stringify(drafts[0] ?? {}).includes('Ramesh Traders'));
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
