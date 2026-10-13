#!/usr/bin/env node
/** QA B24: adding an app shows immediate progress, rejects repeat clicks and confirms success. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/add-app-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (label, okay, detail = '') => {
  if (!okay) failed++;
  console.log(`${okay ? 'PASS' : 'FAIL'} ${label}: ${detail}`);
};
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium' });
try {
  for (const width of [1280, 360]) {
    const owner = await newUser();
    const tenant = await must('POST', '/tenants', { name: `Add Apps ${uniq()}`, state_code: '27', business_type: 'retail', apps: ['shop'] }, owner.token);
    owner.token = tenant.access_token ?? owner.token;
    for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, owner.token);
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(owner.email);
    await page.locator('input[type=password]').fill(owner.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.waitForLoadState('networkidle');
    let enables = 0;
    await page.route('**/api/v1/tenants/current/apps', async route => {
      enables++;
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    for (const [app, path] of [['Library', '/library'], ['Lending', '/lending']]) {
      await page.getByRole('button', { name: /Current business:/ }).first().click();
      await page.evaluate(() => {
        window.__addAppTiming = { clicked: null, busy: null };
        document.addEventListener('click', () => { window.__addAppTiming.clicked = performance.now(); }, { once: true, capture: true });
        window.__addAppObserver = new MutationObserver(() => {
          const row = document.querySelector('[role="menuitem"][aria-busy="true"]');
          if (row && row.getBoundingClientRect().width > 0 && window.__addAppTiming.busy === null) window.__addAppTiming.busy = performance.now();
        });
        window.__addAppObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
      });
      const start = enables;
      await page.getByRole('menuitem', { name: `Add ${app}`, exact: true }).dblclick({ delay: 50 });
      await page.waitForTimeout(100);
      const busy = page.getByRole('menuitem', { name: `Adding ${app}…`, exact: true });
      const present = await busy.count() > 0;
      const timing = await page.evaluate(() => window.__addAppTiming);
      check(`${width} ${app} progress is visible within 100 ms`, present && timing.busy !== null && timing.busy - timing.clicked <= 100, JSON.stringify(timing));
      check(`${width} ${app} busy row rejects repeat clicks`, present && await busy.isDisabled());
      check(`${width} ${app} loading menu fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${width}-${app.toLowerCase()}-loading.png`, fullPage: true });
      await page.waitForURL(`**${path}`, { timeout: 20000 });
      const toast = page.getByTestId('snackbar');
      const saved = await toast.count() > 0 && (await toast.innerText()).includes(`${app} added`);
      check(`${width} ${app} success is confirmed`, saved);
      await page.waitForLoadState('networkidle');
      check(`${width} ${app} enabled exactly once`, enables - start === 1, `${enables - start}`);
      check(`${width} ${app} menu closes after success`, await page.getByRole('menu').count() === 0);
      check(`${width} ${app} page fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${width}-${app.toLowerCase()}-added.png`, fullPage: true });
      await page.evaluate(() => window.__addAppObserver.disconnect());
    }
    check(`${width} no browser errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
