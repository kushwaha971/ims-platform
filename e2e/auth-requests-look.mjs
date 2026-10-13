#!/usr/bin/env node
/** QA B21: app switches send one mutation, and normal RSC navigation has no 5xx. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/auth-requests-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (label, okay, details = '') => {
  if (!okay) failed++;
  console.log(`${okay ? 'PASS' : 'FAIL'} ${label}: ${details}`);
};
const owner = await newUser();
const tenant = await must('POST', '/tenants', { name: `Quiet Apps ${uniq()}`, state_code: '27', business_type: 'retail', apps: ['shop', 'library', 'lending'] }, owner.token);
owner.token = tenant.access_token ?? owner.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, owner.token);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium' });
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const auth = [], responses = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/v1/auth/')) auth.push({ method: request.method(), path, body: request.postData() });
    });
    page.on('response', response => {
      const request = response.request();
      responses.push({ url: response.url(), status: response.status(), rsc: new URL(response.url()).searchParams.has('_rsc') || request.headers().rsc === '1' });
    });
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(owner.email);
    await page.locator('input[type=password]').fill(owner.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto(`${frontend}/customers`, { waitUntil: 'networkidle' });
    // Ordinary latency exposes a switcher/path-sync race hidden by instant localhost responses.
    await page.route('**/api/v1/auth/switch-app', async route => {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.continue();
    });
    for (const [label, path, code] of [['Library', '/library', 'library'], ['Lending', '/lending', 'lending'], ['Shop', '/dashboard', 'shop']]) {
      const start = auth.length;
      await page.getByRole('button', { name: /Current business:/ }).first().click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const calls = auth.slice(start);
      const switches = calls.filter(call => call.path.endsWith('/switch-app'));
      check(`${width} ${label} has one switch request`, switches.length === 1 && JSON.parse(switches[0].body).app === code, JSON.stringify(calls));
      check(`${width} ${label} has at most two auth calls`, calls.length <= 2, `${calls.length}`);
      check(`${width} ${label} page fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${width}-${code}.png`, fullPage: true });
    }
    for (const path of ['/sales/invoices', '/imports']) {
      let candidates = page.locator(`a[href="${path}"]`);
      let link;
      for (let i = 0; i < await candidates.count(); i++) if (await candidates.nth(i).isVisible()) { link = candidates.nth(i); break; }
      if (!link && width === 360) {
        await page.getByRole('link', { name: 'More', exact: true }).click();
        await page.waitForURL('**/more');
        candidates = page.locator(`main a[href="${path}"]`);
        if (await candidates.count()) link = candidates.first();
      }
      if (link) await link.click();
      else await page.goto(`${frontend}${path}`);
      await page.waitForURL(`**${path}`);
      await page.waitForLoadState('networkidle');
      check(`${width} ${path} opens normally`, !/503|Service unavailable/i.test(await page.locator('main').innerText()));
    }
    const rsc = responses.filter(response => response.rsc);
    check(`${width} RSC requests were observed`, rsc.length > 0, `${rsc.length}`);
    check(`${width} RSC requests have no 5xx`, rsc.every(response => response.status < 500));
    check(`${width} normal requests have no 5xx`, responses.every(response => response.status < 500));
    check(`${width} no browser errors`, errors.length === 0, errors.join(' | '));
    writeFileSync(`${out}/${width}-network.json`, JSON.stringify({ auth, responses }, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
