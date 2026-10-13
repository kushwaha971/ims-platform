#!/usr/bin/env node
/** QA B17: real money, document identifiers, phones and decimal quantities must fit. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { addParty, fixtureGstin, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const frontend = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const out = process.argv[2] ?? '/tmp/layout-look';
mkdirSync(out, { recursive: true });
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};
const owner = await newUser();
const tenant = await must('POST', '/tenants', {
  name: `Layout Shop ${uniq()}`, state_code: '27', business_type: 'retail',
  apps: ['shop', 'library', 'lending'],
}, owner.token);
owner.token = tenant.access_token ?? owner.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, owner.token);
await must('PATCH', '/tenants/current', { gst_type: 'regular', gstin: fixtureGstin() }, owner.token);
const person = await addParty(owner.token, { name: 'Layout Customer', display_code: 'C-001', mobile: uniqMobile(), state_code: '27', is_supplier: true });
const student = await addParty(owner.token, { name: 'Layout Student', mobile: uniqMobile() });
const plan = await must('POST', '/library/membership-types', { name: 'Monthly', fee_amount: '12345.67', validity_months: 1 }, owner.token);
await must('POST', '/library/members', { party_id: student.id, membership_type_id: plan.id }, owner.token);
const units = await must('GET', '/units', null, owner.token);
const kg = units.find((unit) => unit.code === 'KGS');
if (!kg) throw new Error('The seeded KGS unit is required');
const item = await must('POST', '/items', {
  name: 'Layout Rice', unit_id: kg.id, selling_price: '100.00', purchase_price: '80.00', tax_code: 'GST5',
  hsn_sac: '1006', opening_stock: { qty: '50', unit_cost: '80.00' },
}, owner.token);
const invoice = await must('POST', '/sales/invoices', {
  party_id: person.id, lines: [{ item_id: item.id, qty: '2.5' }],
}, owner.token);
const bill = await must('POST', '/purchases/bills', {
  party_id: person.id, lines: [{ item_id: item.id, qty: '2.5', unit_cost: '80.00' }],
}, owner.token);
const issued = await must('POST', `/sales/invoices/${invoice.id}/issue`, { version: invoice.version }, owner.token);
const draft = await must('POST', '/sales/invoices', {
  party_id: person.id, lines: [{ item_id: item.id, qty: '2.5' }],
}, owner.token);
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const width of [1057, 1024, 1280, 360, 1440, 1536]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${frontend}/login/email`);
    await page.locator('input[type=email]').fill(owner.email);
    await page.locator('input[type=password]').fill(owner.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    const photograph = async (name) => {
      record(`${width} ${name} page fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: true });
    };
    const checkCells = async (name) => {
      const clipped = await page.evaluate(() => [...document.querySelectorAll('td, td *')].filter((el) => {
        const style = getComputedStyle(el);
        return !el.closest('.sr-only') && el.clientWidth > 0 && /₹|unpaid|Paid|\+91/.test(el.textContent ?? '') &&
          el.scrollWidth > el.clientWidth + 1 && style.overflowX === 'hidden';
      }).map((el) => el.textContent.trim()));
      record(`${width} ${name} money and contact text is not clipped`, clipped.length === 0, clipped.join(' | '));
    };
    await page.goto(`${frontend}/library/members`, { waitUntil: 'networkidle' });
    await page.getByText(student.name, { exact: true }).waitFor();
    if (width >= 1024) {
      const row = page.getByRole('row').filter({ hasText: student.name });
      record(`${width} student fee amount and status remain visible`,
        await row.locator('[lang="en-IN"]').first().isVisible() && /₹12,345\.67/.test(await row.innerText()) &&
        await row.getByText('Fee unpaid', { exact: true }).isVisible());
    }
    await checkCells('students');
    await photograph('students');
    await page.goto(`${frontend}/customers`, { waitUntil: 'networkidle' });
    await page.getByText(person.name, { exact: true }).first().waitFor();
    await checkCells('customers');
    await photograph('customers');

    for (const [path, name] of [[`/sales/invoices/${draft.id}/edit`, 'invoice'], [`/purchases/bills/${bill.id}/edit`, 'purchase']]) {
      await page.goto(`${frontend}${path}`, { waitUntil: 'networkidle' });
      const quantity = page.getByRole('textbox', { name: /Qty.*line 1|Quantity.*line 1/i });
      await quantity.waitFor();
      record(`${width} ${name} retains the complete decimal quantity`, /^2\.50*$/.test(await quantity.inputValue()), await quantity.inputValue());
      const fit = await quantity.evaluate((el) => {
        const style = getComputedStyle(el);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d'); ctx.font = style.font;
        return ctx.measureText(el.value).width <= el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      record(`${width} ${name} decimal quantity fits`, fit);
      if (width >= 1024) {
        const scrolls = await page.evaluate(() => [...document.querySelectorAll('main [role=table]')].filter((el) => el.scrollWidth > el.clientWidth + 1).length);
        record(`${width} ${name} form has no sideways scroll`, scrolls === 0, `${scrolls} tables`);
      }
      await photograph(name);
    }
    await page.goto(`${frontend}/sales/invoices/${issued.id}`, { waitUntil: 'networkidle' });
    const title = page.getByRole('heading', { name: issued.number, exact: true });
    await title.waitFor();
    record(`${width} complete invoice number fits`, await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    await photograph('invoice-view');
    await page.goto(`${frontend}/lending/loans/new`, { waitUntil: 'networkidle' });
    const mobile = page.getByRole('textbox', { name: /^Mobile\b/ });
    await mobile.waitFor();
    record(`${width} mobile placeholder fits`, await mobile.evaluate((el) => {
      const style = getComputedStyle(el), ctx = document.createElement('canvas').getContext('2d');
      ctx.font = style.font;
      return ctx.measureText(el.placeholder).width <= el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }));
    await photograph('loan');
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
