#!/usr/bin/env node
/** QA B18: late totals and autosave messages must not move the next click target. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq } from './lib/fixtures.mjs';

const root = process.env.LIGHTHOUSE_ROOT ?? '/workspace/yourkhata-cloud/tools/node_modules';
const toolRequire = createRequire(`${root}/package.json`);
const { default: lighthouse, startTimespan } = await import(pathToFileURL(toolRequire.resolve('lighthouse')).href);
const { default: puppeteer } = await import(pathToFileURL(toolRequire.resolve('puppeteer-core')).href);
const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/layout-shift-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (name, okay, detail = '') => {
  if (!okay) failed++;
  console.log(`${okay ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const user = await newUser();
const tenant = await must('POST', '/tenants', { name: `Stable Layout ${uniq()}`, business_type: 'retail', state_code: '27', apps: ['shop', 'library'] }, user.token);
user.token = tenant.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const party = await addParty(user.token, { name: 'Stable Student' });
const plan = await must('POST', '/library/membership-types', { name: 'Monthly', fee_amount: '300.00', validity_months: 1 }, user.token);
await must('POST', '/library/members', { party_id: party.id, membership_type_id: plan.id }, user.token);
const units = await must('GET', '/units', null, user.token);
const item = await must('POST', '/items', { name: 'Stable Rice', unit_id: units.find(u => u.code === 'NOS').id, selling_price: '100.00', opening_stock: { qty: '50', unit_cost: '80.00' } }, user.token);
const draft = await must('POST', '/sales/invoices', { party_id: party.id, lines: [{ item_id: item.id, qty: '1' }] }, user.token);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--remote-debugging-port=9225'] });
const auditBrowser = await puppeteer.connect({ browserURL: 'http://localhost:9225', defaultViewport: null });
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
    const auditPage = (await auditBrowser.pages()).find(p => p.url() === page.url());
    if (!auditPage) throw new Error('Lighthouse must use the authenticated browser page');
    check(`${width} audit preserves viewport`, await page.evaluate(() => innerWidth) === width);
    const config = { extends: 'lighthouse:default', settings: { onlyAudits: ['cumulative-layout-shift'], formFactor: width === 360 ? 'mobile' : 'desktop', screenEmulation: { disabled: true }, throttlingMethod: 'provided', disableStorageReset: true } };
    await page.route('**/api/v1/library/members**', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
    const audit = lighthouse(`${frontend}/library/members`, { disableStorageReset: true }, config, auditPage);
    const search = page.getByRole('searchbox');
    await search.waitFor();
    const before = await search.boundingBox();
    await page.screenshot({ path: `${out}/${width}-students-loading.png`, fullPage: true });
    await page.getByTestId('library-members-totals').waitFor();
    const after = await search.boundingBox();
    check(`${width} students search stays put`, Math.abs(after.y - before.y) <= 1, `${before.y} → ${after.y}`);
    const students = await audit;
    writeFileSync(`${out}/${width}-students-lighthouse.json`, JSON.stringify(students.lhr, null, 2));
    check(`${width} students Lighthouse CLS`, students.lhr.audits['cumulative-layout-shift'].numericValue < 0.1, students.lhr.audits['cumulative-layout-shift'].numericValue);
    await page.screenshot({ path: `${out}/${width}-students-loaded.png`, fullPage: true });
    await page.unroute('**/api/v1/library/members**');
    await page.goto(`${frontend}/sales/invoices/${draft.id}/edit`, { waitUntil: 'networkidle' });
    const quantity = page.getByRole('textbox', { name: /Qty.*line 1/i });
    await quantity.waitFor();
    const initial = await quantity.boundingBox();
    await page.screenshot({ path: `${out}/${width}-invoice-idle.png`, fullPage: true });
    const span = await startTimespan(auditPage, { config });
    await quantity.fill(width === 1280 ? '2' : '3');
    await page.getByTestId('invoice-save-indicator').filter({ hasText: /Draft saved/ }).waitFor({ timeout: 20000 });
    const saved = await quantity.boundingBox();
    check(`${width} invoice quantity stays put after save`, Math.abs(saved.y - initial.y) <= 1, `${initial.y} → ${saved.y}`);
    const invoice = await span.endTimespan();
    writeFileSync(`${out}/${width}-invoice-lighthouse.json`, JSON.stringify(invoice.lhr, null, 2));
    check(`${width} invoice Lighthouse CLS`, invoice.lhr.audits['cumulative-layout-shift'].numericValue < 0.1, invoice.lhr.audits['cumulative-layout-shift'].numericValue);
    await page.screenshot({ path: `${out}/${width}-invoice-saved.png`, fullPage: true });
    check(`${width} page fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${width} browser has no errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await auditBrowser.disconnect();
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
