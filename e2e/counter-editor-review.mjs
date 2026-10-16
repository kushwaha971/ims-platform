#!/usr/bin/env node
/**
 * WP-05 design review — measures the sales invoice and purchase bill editors
 * as they are TODAY, so the redesign is argued from numbers and pictures
 * rather than taste. On a live stack, a synthetic shop with drafts of 1, 10
 * and 50 lines, at eight widths, it records for each editor:
 *   * which line layout is drawn (table or phone cards) and the lines' width;
 *   * how tall one line is, and how far down the page the 10th line sits;
 *   * whether the grand total is on screen without scrolling, and where;
 *   * page overflow and any text cut inside its own box.
 * It changes nothing and issues nothing: drafts only. Screenshots go to
 * /tmp/e2e-shots/counter-review and the numbers to measurements.json there.
 *
 *   node e2e/counter-editor-review.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/counter-review';
mkdirSync(ROOT, { recursive: true });
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const WIDTHS = [
  ['phone-360', 360, 780], ['phone-390', 390, 844], ['tablet-768', 768, 1024], ['laptop-1024', 1024, 768],
  ['laptop-1280', 1280, 800], ['desktop-1440', 1440, 900], ['desktop-1536', 1536, 864], ['wide-1920', 1920, 1080],
];

const email = `counterrev-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Counter Review Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Kirana', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const units = await must('GET', '/units', null, tok);
const nos = units.find((u) => u.code === 'NOS');
const kgs = units.find((u) => u.code === 'KGS');
const NAMES = ['Basmati Rice 5kg', 'Toor Dal', 'Sunflower Oil 1L', 'Sugar', 'Tata Salt 1kg', 'Atta 10kg', 'Turmeric powder', 'Red chilli powder', 'Tea 250g', 'Biscuits pack'];
const items = [];
for (let i = 0; i < 50; i += 1) {
  const loose = i % 3 === 1;
  items.push(await must('POST', '/items', {
    name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`,
    unit_id: (loose ? kgs : nos).id, selling_price: `${120 + i * 7}.00`, purchase_price: `${90 + i * 5}.00`,
    tax_code: 'GST5', hsn_sac: '1006', opening_stock: { qty: '500', unit_cost: `${90 + i * 5}.00` },
  }, tok));
}
const customer = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, mobile: '9820011223', state_code: '27' }, tok);
const supplier = await must('POST', '/parties', { name: 'Mahalaxmi Wholesale', is_supplier: true, state_code: '27' }, tok);
const drafts = { invoice: {}, bill: {} };
for (const count of [1, 10, 50]) {
  const lines = items.slice(0, count).map((item, i) => ({ item_id: item.id, qty: i % 3 === 1 ? '2.5' : String(1 + (i % 4)) }));
  let r = await api('POST', '/sales/invoices', { party_id: customer.id, document_date: TODAY, due_on: TODAY, lines }, tok);
  if (r.status >= 300) throw new Error(`invoice draft ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  drafts.invoice[count] = r.body.data.id;
  r = await api('POST', '/purchases/bills', {
    party_id: supplier.id, supplier_invoice_number: `MW-${uniq()}`, supplier_invoice_date: TODAY, document_date: TODAY, due_on: TODAY,
    lines: items.slice(0, count).map((item, i) => ({ item_id: item.id, qty: String(5 + (i % 4)), unit_cost: `${90 + i * 5}.00`, tax_code: 'GST5' })),
  }, tok);
  if (r.status >= 300) throw new Error(`bill draft ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  drafts.bill[count] = r.body.data.id;
}

const measure = (page) => page.evaluate(() => {
  const editor = document.querySelector('[data-testid="line-items-editor"]');
  const rows = editor ? [...editor.querySelectorAll('[role="row"]')].filter((r) => r.querySelector('[data-line-cell]')) : [];
  const cards = editor ? [...editor.querySelectorAll('[data-line-card], li, article')] : [];
  const lineBoxes = rows.length ? rows : cards;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const totalLabel = [...document.querySelectorAll('main *')].find(
    (el) => el.children.length === 0 && /^(Grand total|Total)$/.test((el.textContent ?? '').trim()) && el.getClientRects().length,
  );
  const tb = box(totalLabel);
  const cut = [...document.querySelectorAll('main input, main [role="cell"] *, main label, main p, main span')]
    .filter((el) => el.getClientRects().length && el.scrollWidth - el.clientWidth > 1 && !el.className.toString().includes('sr-only'))
    .filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' || el.tagName === 'INPUT')
    .map((el) => (el.tagName === 'INPUT' ? `input:${el.getAttribute('aria-label') ?? ''}=${el.value}` : (el.textContent ?? '').trim()))
    .slice(0, 8);
  const tenth = lineBoxes[9] ? box(lineBoxes[9]) : null;
  return {
    layout: editor?.getAttribute('data-layout') ?? null,
    editorWidth: editor ? Math.round(box(editor).width) : null,
    lineHeight: lineBoxes[1] ? Math.round(box(lineBoxes[1]).height) : lineBoxes[0] ? Math.round(box(lineBoxes[0]).height) : null,
    firstLineTop: lineBoxes[0] ? Math.round(box(lineBoxes[0]).top + window.scrollY) : null,
    tenthLineTop: tenth ? Math.round(tenth.top + window.scrollY) : null,
    totalTop: tb ? Math.round(tb.top + window.scrollY) : null,
    totalOnScreen: tb ? tb.top >= 0 && tb.bottom <= window.innerHeight : false,
    pageHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cut,
  };
});

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const results = [];
for (const [name, width, height] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  for (const [kind, path] of [['invoice', '/sales/invoices'], ['bill', '/purchases/bills']]) {
    for (const count of [1, 10, 50]) {
      await page.goto(`${FE}${path}/${drafts[kind][count]}/edit`, { waitUntil: 'networkidle' });
      await page.getByTestId('line-items-editor').waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      const m = await measure(page);
      results.push({ kind, width: name, lines: count, ...m, errors: errors.splice(0) });
      console.log(`${kind.padEnd(7)} ${name.padEnd(13)} ${String(count).padStart(2)} lines  ${String(m.layout).padEnd(5)} editor ${m.editorWidth}px  line ${m.lineHeight}px  10th@${m.tenthLineTop ?? '-'}  total@${m.totalTop} ${m.totalOnScreen ? 'on screen' : 'below'}  page ${m.pageHeight}px  overflow ${m.overflow}  cut ${m.cut.length}`);
      if (count !== 50) await page.screenshot({ path: `${ROOT}/${kind}-${name}-${count}.png`, fullPage: count === 10 });
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${ROOT}/measurements.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length} measurements in ${ROOT}/measurements.json`);
