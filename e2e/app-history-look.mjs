#!/usr/bin/env node
/** QA B11/B42: Back, Forward and reload preserve a Shop customer's app and real roles. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/app-history-look';
mkdirSync(out, { recursive: true });
const user = await newUser();
const tenant = await must('POST', '/tenants', {
  name: `Back Test ${uniq()}`, business_type: 'retail', state_code: '27', apps: ['shop', 'library'],
}, user.token);
user.token = tenant.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const party = await addParty(user.token, { name: 'Shop Only Customer' });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(user.email);
    await page.locator('input[type=password]').fill(user.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(`${frontend}/customers`, { waitUntil: 'networkidle' });
    await page.getByText(party.name, { exact: true }).click();
    await page.waitForURL(`**/parties/${party.id}`);
    await page.getByText('No bills or payments yet', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Current business:/ }).first().click();
    await page.getByRole('menuitem', { name: 'Library', exact: true }).click();
    await page.waitForURL('**/library');
    await page.waitForLoadState('networkidle');
    await page.goBack({ waitUntil: 'networkidle' });
    const checkShop = async (label) => {
      await page.getByText('No bills or payments yet', { exact: true }).waitFor();
      await page.waitForTimeout(500);
      const text = await page.locator('body').innerText();
      assert.ok(text.includes('Customer'), 'a Shop customer keeps their actual role');
      assert.ok(!/\bStudent\b|You gave|You got/.test(text), 'no Library role or udhaar controls');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      await page.getByRole('button', { name: /Current business:/ }).first().click();
      const shop = page.getByRole('menuitem', { name: 'Shop', exact: true });
      assert.equal(await shop.getAttribute('aria-current'), 'true', 'the switcher restores Shop');
      await page.getByRole('button', { name: /Current business:/ }).first().click();
      await page.getByRole('menu').waitFor({ state: 'hidden' });
      await page.screenshot({ path: `${out}/${width}-${label}.png`, fullPage: true });
      console.log(`PASS ${width}: ${label} restores Shop, actual roles and viewport fit`);
    };
    await checkShop('back');
    await page.goForward({ waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, '/library');
    await page.goBack({ waitUntil: 'networkidle' });
    await checkShop('second-back');
    await page.reload({ waitUntil: 'networkidle' });
    await checkShop('reload');
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
