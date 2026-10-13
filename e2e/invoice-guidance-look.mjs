#!/usr/bin/env node
/** QA B20: explain incomplete invoice details and missing supplier state in plain words. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { addParty, fixtureGstin, must, newUser, uniq } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/invoice-guidance-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (name, okay, detail = '') => {
  if (!okay) failed++;
  console.log(`${okay ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const owner = await newUser();
const tenant = await must('POST', '/tenants', { name: `Plain Bills ${uniq()}`, state_code: '27', business_type: 'retail', apps: ['shop'] }, owner.token);
owner.token = tenant.access_token ?? owner.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, owner.token);
await must('PATCH', '/tenants/current', { gst_type: 'regular', gstin: fixtureGstin() }, owner.token);
const supplier = await addParty(owner.token, { name: 'Supplier Without State', is_supplier: true });
const units = await must('GET', '/units', null, owner.token);
const item = await must('POST', '/items', { name: 'Rice Without Tax Classification', unit_id: units.find(u => u.code === 'NOS').id, selling_price: '100', purchase_price: '80', tax_code: 'GST5', opening_stock: { qty: '50', unit_cost: '80' } }, owner.token);
const invoice = await must('POST', '/sales/invoices', { party_id: supplier.id, lines: [{ item_id: item.id, qty: '1' }] }, owner.token);
const bill = await must('POST', '/purchases/bills', { party_id: supplier.id, lines: [{ item_id: item.id, qty: '1', unit_cost: '80' }] }, owner.token);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium' });
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(owner.email);
    await page.locator('input[type=password]').fill(owner.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    await page.goto(`${frontend}/sales/invoices/${invoice.id}/edit`, { waitUntil: 'networkidle' });
    await page.getByTestId('invoice-grand-total').waitFor();
    check(`${width} invoice has no unexplained rule number`, !/Rule 46/.test(await page.locator('main').innerText()));
    const trigger = page.getByRole('button', { name: /Invoice details:/ });
    const hasChecklist = await trigger.count() > 0;
    check(`${width} invoice offers a checklist`, hasChecklist);
    if (hasChecklist) {
      await trigger.click();
      const panel = page.getByRole('dialog', { name: 'Check invoice details' });
      await panel.waitFor();
      check(`${width} checklist explains missing business address`, await panel.getByText('Add your business address.', { exact: true }).isVisible());
      check(`${width} checklist explains missing item tax code`, await panel.getByText(/Add the item tax code/).isVisible());
    }
    check(`${width} invoice fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/${width}-invoice-checklist.png`, fullPage: true });
    if (hasChecklist) await page.keyboard.press('Escape');
    await page.goto(`${frontend}/purchases/bills/${bill.id}/edit`, { waitUntil: 'networkidle' });
    await page.getByTestId('purchase-grand-total').waitFor();
    await Promise.all([
      page.waitForResponse(response => response.url().includes(`/purchases/bills/${bill.id}`) && response.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Save draft', exact: true }).click(),
    ]);
    await page.getByRole('status').filter({ hasText: /state/i }).waitFor();
    check(`${width} supplier warning has no unexplained state code`, !/assumed\s+27|Supplier state unknown/.test(await page.locator('main').innerText()));
    const link = page.getByRole('link', { name: "Add the supplier's state" });
    check(`${width} supplier warning offers the correct record`, await link.count() > 0 && await link.getAttribute('href') === `/parties/${supplier.id}`);
    check(`${width} purchase fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/${width}-supplier-state.png`, fullPage: true });
    if (await link.count() > 0) {
      await link.click();
      await page.getByRole('heading', { name: supplier.name, exact: true }).waitFor();
      check(`${width} corrective link opens the named supplier`, true);
    }
    check(`${width} no browser errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
