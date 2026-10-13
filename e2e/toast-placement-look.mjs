#!/usr/bin/env node
/** QA B19: real save toasts must clear page headings and fixed primary actions. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/toast-placement-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (name, okay, detail = '') => {
  if (!okay) failed++;
  console.log(`${okay ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const user = await newUser();
const tenant = await must('POST', '/tenants', { name: `Toast Shop ${uniq()}`, state_code: '27', business_type: 'retail', apps: ['shop'] }, user.token);
user.token = tenant.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium' });
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(user.email);
    await page.locator('input[type=password]').fill(user.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto(`${frontend}/customers`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill(`${width} Main Road Wholesale and Retail Supplies Customer`);
    await dialog.getByRole('button', { name: /Save|Add customer/, exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const toast = page.getByTestId('snackbar');
    await toast.waitFor();
    const geometry = await toast.evaluate(el => {
      const box = el.getBoundingClientRect();
      const visible = selector => [...document.querySelectorAll(selector)].map(node => ({ node, rect: node.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0);
      const overlaps = rect => box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
      const headings = visible('main h1');
      const actions = visible('main header button, [data-ub-fab] button, [data-ub-bottom-nav], [data-ub-bottom-bar]');
      return { top: box.top, right: box.right, bottom: box.bottom, titleOverlap: headings.some(({ rect }) => overlaps(rect)), actionOverlap: actions.some(({ rect }) => overlaps(rect)), titleBottom: Math.max(...headings.map(({ rect }) => rect.bottom)), bottomFurniture: Math.min(innerHeight, ...visible('[data-ub-bottom-bar]').map(({ rect }) => rect.top)) };
    });
    check(`${width} toast clears the title`, !geometry.titleOverlap, JSON.stringify(geometry));
    check(`${width} toast clears primary actions`, !geometry.actionOverlap);
    if (width >= 1024) {
      check(`${width} desktop toast is below the heading`, geometry.top >= geometry.titleBottom + 8);
      check(`${width} desktop toast is right aligned`, Math.abs(width - 16 - geometry.right) <= 1);
    } else {
      check(`${width} mobile toast is above bottom furniture`, geometry.bottom <= geometry.bottomFurniture - 8);
      check(`${width} mobile toast stays near the bottom`, geometry.bottom > 600);
    }
    check(`${width} page fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${width} no browser errors`, errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: `${out}/${width}-customer-saved.png`, fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
