#!/usr/bin/env node
/**
 * WP-03 D-04a — the ⋯ sheets after they became one component. On a live
 * stack, a synthetic shop with one customer and one khata entry, at a 360 px
 * phone and a 1280 laptop:
 *   * the khata page's ⋯ opens a sheet of worded rows, inside the viewport;
 *   * choosing Edit closes the sheet BEFORE the drawer opens, so one overlay
 *     is on screen, and Escape closes the drawer and leaves nothing behind;
 *   * an entry's ⋯ opens its sheet with the "stays in the book" note, and
 *     Correct opens the correction drawer with the sheet gone.
 * Nothing is sent to anybody. Screenshots go to /tmp/e2e-shots/action-sheet.
 *
 *   node e2e/action-sheet-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/action-sheet';
mkdirSync(ROOT, { recursive: true });
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const email = `sheet-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Sheet Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Kirana', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const party = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, mobile: '9820011223', state_code: '27' }, tok);
await must('POST', `/parties/${party.id}/ledger-entries`, { entry_date: TODAY, direction: 'debit', amount: '500.00', note: 'Cement bags' }, tok);

const overlays = (page) => page.locator('[role="dialog"]').count();
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['phone-360', { width: 360, height: 780 }], ['laptop-1280', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  // DEC-019 — the entry menu is the Udhaar book's: open its list first, as a
  // merchant does, so the person page reads that book (from the Shop it shows bills).
  await page.goto(`${FE}/khata`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
  await page.goto(`${FE}/parties/${party.id}`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'More actions' });
  await sheet.waitFor();
  const box = await sheet.boundingBox();
  check(`${size}: the khata ⋯ sheet sits inside the screen`, box && box.x >= 0 && box.x + box.width <= viewport.width + 0.5, JSON.stringify(box));
  check(`${size}: the sheet lists worded rows`, (await sheet.getByRole('button', { name: 'Edit' }).count()) === 1);
  await page.screenshot({ path: `${ROOT}/${size}-khata-sheet.png` });
  await sheet.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog', { name: /Edit/ }).first().waitFor();
  check(`${size}: Edit leaves one overlay, the drawer`, (await overlays(page)) === 1, `${await overlays(page)} dialogs`);
  await page.screenshot({ path: `${ROOT}/${size}-khata-edit.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${size}: Escape closes the drawer and leaves nothing behind`, (await overlays(page)) === 0, `${await overlays(page)} dialogs`);

  await page.getByRole('button', { name: 'More actions for Cement bags' }).first().click();
  const entrySheet = page.getByRole('dialog').filter({ hasText: 'Correct' });
  await entrySheet.waitFor();
  check(`${size}: the entry sheet keeps its "stays in the book" note`, (await entrySheet.innerText()).length > 0);
  await page.screenshot({ path: `${ROOT}/${size}-entry-sheet.png` });
  await entrySheet.getByRole('button', { name: /^Correct/ }).click();
  await page.waitForTimeout(600);
  check(`${size}: Correct leaves one overlay, the correction drawer`, (await overlays(page)) === 1, `${await overlays(page)} dialogs`);
  await page.screenshot({ path: `${ROOT}/${size}-entry-correct.png` });
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
