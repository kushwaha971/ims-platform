#!/usr/bin/env node
/**
 * QA B16: feedback lives in account navigation, never over a field or amount.
 * Build with the same dummy project used by e2e/analytics.mjs. Every PostHog
 * request is fulfilled locally; no project receives the fixtures or events.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { must, newUser, uniq } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/feedback-look';
mkdirSync(out, { recursive: true });
const surveyScript = readFileSync(new URL('../frontend/node_modules/posthog-js/dist/surveys.js', import.meta.url), 'utf8');
const survey = {
  id: 'local-feedback-survey', name: 'Local QA', type: 'popover',
  start_date: '2026-10-01T00:00:00Z', end_date: null,
  questions: [{ type: 'open', question: 'Local QA feedback' }],
  conditions: { url: '^never-auto-show$', urlMatchType: 'regex' },
};
const owner = await newUser();
const tenant = await must('POST', '/tenants', {
  name: `Feedback Room ${uniq()}`, state_code: '27', apps: ['library'],
}, owner.token);
owner.token = tenant.access_token ?? owner.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, owner.token);
let failed = 0;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const width of [1280, 360, 768, 1024, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
    });
    let definitions = 0;
    await context.route(/posthog\.com/, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/api/surveys/')) {
        definitions += 1;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ surveys: [survey] }) });
      } else if (url.pathname.endsWith('/surveys.js')) {
        await route.fulfill({ contentType: 'application/javascript', body: surveyScript });
      } else if (url.pathname.endsWith('.js')) {
        await route.fulfill({ contentType: 'application/javascript', body: '' });
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 1, featureFlags: {}, sessionRecording: false, surveys: true }) });
      }
    });
    const page = await context.newPage();
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(owner.email);
    await page.locator('input[type=password]').fill(owner.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(`${frontend}/library/fees`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    assert.ok(definitions > 0, 'the SDK received a real local survey fixture');
    const floating = await page.getByTestId('feedback-tab').count();
    if (floating) {
      failed += 1;
      console.log(`FAIL ${width}: Feedback still floats over the page`);
      await page.screenshot({ path: `${out}/${width}-fees.png`, fullPage: true });
      await context.close();
      continue;
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.screenshot({ path: `${out}/${width}-fees.png`, fullPage: true });
    if (width >= 1024) {
      await page.getByRole('button', { name: /Account menu for/ }).click();
      await page.getByRole('menuitem', { name: 'Give feedback', exact: true }).waitFor();
      await page.screenshot({ path: `${out}/${width}-account.png`, fullPage: true });
      await page.getByRole('menuitem', { name: 'Give feedback', exact: true }).click();
    } else {
      await page.goto(`${frontend}/more`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Give feedback', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${width}-account.png`, fullPage: true });
      await page.getByRole('button', { name: 'Give feedback', exact: true }).click();
    }
    await page.getByText('Local QA feedback', { exact: true }).waitFor();
    console.log(`PASS ${width}: no floating control, account feedback opens the local survey`);
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
