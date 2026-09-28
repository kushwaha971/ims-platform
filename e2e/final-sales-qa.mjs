// Final QA — sales (SAL-01..08), imports (IMP-01/02), Your data (PLT-10).
// Usage: PHASE=setup|sales|flows|imports|data|phone|hindi node e2e/final-sales-qa.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { newOwner, must, api, addParty, uniq } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const OUT = '/tmp/e2e-shots/qa-final/sales';
const STATE = '/tmp/e2e-shots/qa-final/sales/state.json';
for (const d of ['phone', 'desktop']) mkdirSync(`${OUT}/${d}`, { recursive: true });
const PHASE = process.env.PHASE ?? 'all';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${String(extra).slice(0, 400)}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed, st = '27') => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `${st}${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => { const p = B36.indexOf(ch) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); });
  return body + B36[(36 - (sum % 36)) % 36];
};

async function setup() {
  const o = await newOwner({ shop: 'Sharma Kirana Store', name: 'Suresh Sharma', stateCode: '27', prefix: 'qa-final-sales' });
  const seed = Date.now();
  await must('PATCH', '/tenants/current', {
    gst_type: 'regular', gstin: gstinFor(seed), upi_vpa: 'sharmakirana@okhdfc', phone: '9876501234',
    address: { line1: '14 Mahatma Phule Road', city: 'Pune', state: 'Maharashtra', pincode: '411002', state_code: '27' },
  }, o.token);
  const units = await must('GET', '/units', null, o.token);
  const u = (c) => (units.find((x) => x.code === c) ?? units[0]).id;
  const mk = (name, price, tax, hsn, qty, cost) => must('POST', '/items', {
    name, unit_id: u('NOS'), selling_price: price, tax_code: tax, hsn_sac: hsn,
    opening_stock: { qty, unit_cost: cost },
  }, o.token);
  const rice = await mk('Basmati Rice 5kg', '450.00', 'GST5', '1006', '40', '380.00');
  const dal = await mk('Toor Dal 1kg', '165.00', 'GST5', '0713', '60', '130.00');
  const sugar = await mk('Sugar 1kg', '48.00', 'GST5', '1701', '100', '40.00');
  const ramesh = await addParty(o.token, { name: 'Ramesh Traders', state_code: '27', mobile: '+919822012345' });
  const gupta = await addParty(o.token, { name: 'Gupta Provision Stores', state_code: '29', mobile: '+919845012345', gstin: gstinFor(seed + 7, '29') });
  const s = { email: o.email, password: o.password, token: o.token, rice: rice.id, dal: dal.id, sugar: sugar.id, ramesh: ramesh.id, gupta: gupta.id };
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  console.log('setup', s.email);
  return s;
}

async function login(browser, s, { width = 1280, height = 860, hi = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  if (hi) await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', s.email);
  await page.fill('input[type="password"]', s.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const shot = async (page, dir, name) => { await page.screenshot({ path: `${OUT}/${dir}/${name}.png`, fullPage: true }); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const go = async (page, path, ms = 2500) => { await page.goto(`${FE}${path}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(ms); };
const body = (page) => page.locator('body').innerText();
const stock = async (s, id) => (await must('GET', `/items/${id}`, null, s.token)).on_hand;
const bal = async (s, id) => (await must('GET', `/parties/${id}`, null, s.token)).balance;

async function pickParty(page, name) {
  await page.getByRole('radio', { name: 'Party' }).click().catch(() => page.getByText('Party', { exact: true }).first().click());
  await page.waitForTimeout(300);
  await page.getByPlaceholder('Search by name or mobile').fill(name.slice(0, 5));
  await page.waitForTimeout(1500);
  await page.getByText(name).first().click();
  await page.waitForTimeout(600);
}
async function addItem(page, q, name) {
  const empty = page.locator('[role=combobox]', { hasText: /Search or scan an item|आइटम|खोज/ });
  if (!(await empty.count())) { await page.getByRole('button', { name: /Add item|आइटम जोड़ें/ }).first().click(); await page.waitForTimeout(500); }
  await empty.first().click();
  await page.keyboard.type(q);
  await page.waitForTimeout(1500);
  await page.getByRole('option', { name: new RegExp(name) }).first().click();
  await page.waitForTimeout(700);
}

async function sales(browser, s) {
  const D = 'desktop';
  const { ctx, page } = await login(browser, s);
  await go(page, '/sales/invoices');
  await shot(page, D, '01-invoices-list-empty');

  // ── Party invoice, intra-state, with line + document discount, part payment ──
  await go(page, '/sales/invoices/new', 3000);
  await pickParty(page, 'Ramesh Traders');
  await addItem(page, 'Basm', 'Basmati Rice 5kg');
  await addItem(page, 'Toor', 'Toor Dal 1kg');
  const qty = page.locator('input[aria-label^="Qty"]');
  await qty.nth(0).fill('2');
  await qty.nth(1).fill('3');
  const disc = page.locator('input[aria-label^="Disc"]');
  check('line discount input present', (await disc.count()) >= 2, `count ${await disc.count()}`);
  await disc.nth(1).fill('10').catch(() => {});
  await page.getByRole('radio', { name: '₹ off' }).click().catch(() => {});
  await page.getByPlaceholder('No discount').fill('20').catch((e) => check('document discount field', false, e.message));
  await page.waitForTimeout(1500);
  let txt = await body(page);
  check('intra-state shows CGST + SGST', /Intra-state supply — CGST \+ SGST/.test(txt) && /CGST/.test(txt) && /SGST/.test(txt));
  const totals = await page.getByTestId('invoice-totals').innerText().catch(() => '');
  console.log('TOTALS:', totals.replace(/\n/g, ' | '));
  // 2×450=900 ; 3×165=495 less 10% = 445.50 ; subtotal 1345.50 ; doc −20 → 1325.50 ; GST 5% ≈ 66.28 → 1391.78 → 1392
  check('grand total ₹1,392 (line 10% + ₹20 doc discount, 5% GST, rounded)', /1,392/.test(await page.getByTestId('invoice-grand-total').innerText().catch(() => '')), await page.getByTestId('invoice-grand-total').innerText().catch(() => ''));
  check('round-off row visible', /Round/i.test(totals), totals.replace(/\n/g, ' | '));
  await page.waitForTimeout(3500);
  const ind = await page.getByTestId('invoice-save-indicator').innerText().catch(() => '');
  check('draft autosaved', /saved/i.test(ind), ind);
  await shot(page, D, '02-invoice-editor-party-discounts');
  const draftUrl = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  txt = await body(page);
  const grandAfter = await page.getByTestId('invoice-grand-total').innerText().catch(() => '');
  check('draft restored after reload (party, lines, total)', /Ramesh Traders/.test(txt) && /Basmati/.test(txt) && /Toor Dal/.test(txt) && /1,392/.test(grandAfter), `${draftUrl} → ${page.url()} grand ${grandAfter}`);
  await shot(page, D, '03-invoice-draft-restored');

  const riceBefore = await stock(s, s.rice);
  await page.getByTestId('invoice-issue').click();
  await page.waitForTimeout(1500);
  await shot(page, D, '04-payment-drawer-party');
  const drawer = page.getByRole('dialog');
  const amt = drawer.getByLabel('Amount').first();
  check('Paid-now amount prefilled with grand total (2dp)', /^1392\.00$/.test(await amt.inputValue()), await amt.inputValue());
  await amt.fill('500');
  const afterFill = await amt.inputValue();
  check('Playwright fill() replaces the amount (select-all + type)', afterFill === '500', `value after fill('500') = ${afterFill}`);
  await amt.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('500');
  console.log('after ctrl+a type:', await amt.inputValue());
  if ((await amt.inputValue()) !== '500') { await amt.click({ clickCount: 3 }); await page.keyboard.press('Backspace'); for (let i = 0; i < 12; i++) await page.keyboard.press('Backspace'); await page.keyboard.type('500'); }
  console.log('final amount value:', await amt.inputValue());
  await page.waitForTimeout(500);
  await shot(page, D, '05-payment-drawer-part-paid');
  const confirmTxt = await page.getByTestId('invoice-payment-confirm').innerText().catch(() => '');
  check('confirm reads "Received ₹500 · Issue"', /500/.test(confirmTxt), confirmTxt);
  await page.getByTestId('invoice-payment-confirm').click();
  await page.waitForTimeout(3000);
  const issued = await page.getByRole('dialog').innerText().catch(() => '');
  check('issued as INV/26-27/0001', /INV\/26-27\/0001/.test(issued), issued.replace(/\n/g, ' | '));
  await shot(page, D, '06-invoice-issued-dialog');
  const riceAfter = await stock(s, s.rice);
  check('stock dropped by 2 rice', Number(riceBefore) - Number(riceAfter) === 2, `${riceBefore} → ${riceAfter}`);
  const rb = await bal(s, s.ramesh);
  check('Ramesh khata = 1392 − 500 = 892 debit', /892/.test(JSON.stringify(rb)), JSON.stringify(rb));

  const invs = await must('GET', '/sales/invoices?page_size=50', null, s.token);
  const inv1 = (invs.results ?? invs).find((x) => /0001/.test(x.number ?? ''));
  s.inv1 = inv1?.id;
  console.log('INV1', JSON.stringify(inv1).slice(0, 600));

  await go(page, `/sales/invoices/${s.inv1}`, 3500);
  await shot(page, D, '07-invoice-detail');
  txt = await body(page);
  check('detail shows payment of 500 and balance due', /500/.test(txt) && /892/.test(txt));
  check('UPI QR on bill with money due', (await page.getByTestId('upi-qr').count()) >= 1);
  await page.emulateMedia({ media: 'print' });
  await shot(page, D, '08-print-a4');
  const a4Vis = await page.getByTestId('print-a4').isVisible().catch(() => false);
  check('A4 print sheet visible in print media', a4Vis);
  await page.emulateMedia({ media: 'screen' });
  await page.getByTestId('print-thermal-action').click().catch((e) => check('thermal action', false, e.message));
  await page.waitForTimeout(1200);
  await page.emulateMedia({ media: 'print' });
  await shot(page, D, '09-print-thermal-80mm');
  const tw = await page.getByTestId('print-thermal').boundingBox().catch(() => null);
  check('80 mm sheet width ≈ 302px', tw && tw.width > 250 && tw.width < 340, JSON.stringify(tw));
  await page.emulateMedia({ media: 'screen' });

  // Khata link back
  await go(page, `/parties/${s.ramesh}`, 3000);
  txt = await body(page);
  check('party khata shows INV/26-27/0001 entry', /INV\/26-27\/0001/.test(txt));
  await shot(page, D, '10-party-khata-invoice-entry');
  const link = page.getByRole('link', { name: /INV\/26-27\/0001/ }).first();
  if (await link.count()) { await link.click(); await page.waitForTimeout(2500); check('khata entry links back to invoice', /sales\/invoices\//.test(page.url()), page.url()); }
  else check('khata entry links back to invoice', false, 'no link with invoice number on party page');

  // ── Inter-state (IGST) credit sale to Gupta ──
  await go(page, '/sales/invoices/new', 3000);
  await pickParty(page, 'Gupta Provision Stores');
  await addItem(page, 'Sugar', 'Sugar 1kg');
  await page.locator('input[aria-label^="Qty"]').nth(0).fill('10');
  await page.waitForTimeout(1500);
  txt = await body(page);
  const tot2 = await page.getByTestId('invoice-totals').innerText().catch(() => '');
  check('inter-state shows IGST, no CGST', /Inter-state supply — IGST/.test(txt) && /IGST/.test(tot2) && !/CGST/.test(tot2), tot2.replace(/\n/g, ' | '));
  await shot(page, D, '11-invoice-editor-igst');
  await page.getByTestId('invoice-issue').click();
  await page.waitForTimeout(1500);
  await shot(page, D, '11b-payment-drawer-full-credit');
  await page.getByRole('dialog').getByRole('button', { name: 'Full credit' }).click();
  await page.waitForTimeout(3000);
  const iss2 = await page.getByRole('dialog').innerText().catch(() => '');
  check('IGST invoice issued INV/26-27/0002', /INV\/26-27\/0002/.test(iss2), iss2.replace(/\n/g, ' | '));

  // ── Walk-in cash sale ──
  await go(page, '/sales/invoices/new', 3000);
  await page.getByRole('radio', { name: /Walk-in/ }).click().catch(() => {});
  await addItem(page, 'Toor', 'Toor Dal 1kg');
  await page.waitForTimeout(1200);
  await shot(page, D, '12-walkin-editor');
  await page.getByTestId('invoice-issue').click();
  await page.waitForTimeout(1500);
  const wtxt = await page.getByRole('dialog').innerText().catch(() => '');
  check('walk-in drawer requires full payment', /Walk-in sales must be paid in full/.test(wtxt), wtxt.replace(/\n/g, ' | '));
  await shot(page, D, '13-walkin-payment-drawer');
  await page.getByTestId('invoice-payment-confirm').click();
  await page.waitForTimeout(3000);
  const w2 = await page.getByRole('dialog').innerText().catch(() => '');
  check('walk-in issued INV/26-27/0003 and Paid', /INV\/26-27\/0003/.test(w2) && /Paid/.test(w2), w2.replace(/\n/g, ' | '));
  await shot(page, D, '14-walkin-issued');

  // ── A draft left in the list ──
  await go(page, '/sales/invoices/new', 3000);
  await pickParty(page, 'Ramesh Traders');
  await addItem(page, 'Sugar', 'Sugar 1kg');
  await page.waitForTimeout(4500);

  await go(page, '/sales/invoices', 3000);
  await shot(page, D, '15-invoices-list-filled');
  txt = await body(page);
  check('list shows numbers in dd/mm/yyyy', /\d\d\/\d\d\/\d{4}/.test(txt));
  check('list has tabs (All/Draft/Unpaid/Paid …)', /Draft/.test(txt) && /(Unpaid|Due|Open)/.test(txt), txt.slice(0, 500).replace(/\n/g, ' | '));
  const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
  console.log('TABS', tabs);
  for (const tname of tabs.slice(0, 5)) {
    await page.getByRole('tab', { name: tname }).click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.getByRole('tab').first().click().catch(() => {});
  check('desktop page errors none', page.errors.length === 0, page.errors.join(' / '));
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  await ctx.close();
}

const phases = { setup, sales };

const dump = async (page, label) => console.log(`--- ${label}: ${(await page.locator('main').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 900)}`);

async function flows(browser, s) {
  const D = 'desktop';
  const { ctx, page } = await login(browser, s);
  const list = await must('GET', '/sales/invoices?page_size=50', null, s.token);
  const rows = list.results ?? list;
  const inv1 = rows.find((x) => /0001$/.test(x.number ?? '')); const inv2 = rows.find((x) => /0002$/.test(x.number ?? ''));
  // ── SAL-04 credit note: return 1 Toor Dal from INV/0001 ──
  const dalBefore = await stock(s, s.dal); const balBefore = await bal(s, s.ramesh);
  await go(page, `/sales/invoices/${inv1.id}`, 3000);
  await page.getByTestId('invoice-return').click().catch((e) => check('Return items button', false, e.message));
  await page.waitForTimeout(3000);
  await dump(page, 'credit note editor');
  const rq = page.locator('input[aria-label*="Return qty"], input[placeholder^="0 to"]');
  console.log('return qty inputs', await rq.count());
  await rq.nth(1).fill('5').catch(() => {});
  await page.waitForTimeout(800);
  const cap = await body(page);
  check('credit note caps return qty per line ("Only 3 can be returned")', /Only 3 can be returned/.test(cap));
  await shot(page, D, '16-credit-note-over-cap');
  await rq.nth(1).fill('1').catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, D, '17-credit-note-editor');
  await page.getByTestId('credit-note-issue').click().catch((e) => check('credit note issue', false, e.message));
  await page.waitForTimeout(3500);
  await dump(page, 'after CN issue');
  await shot(page, D, '18-credit-note-issued');
  const dalAfter = await stock(s, s.dal); const balAfter = await bal(s, s.ramesh);
  check('credit note restocks 1 Toor Dal', Number(dalAfter) - Number(dalBefore) === 1, `${dalBefore} → ${dalAfter}`);
  // 1 × 165 less 10% = 148.50 + 5% ... minus doc-discount share; just require a drop
  check('credit note credits khata', Number(balAfter) < Number(balBefore), `${balBefore} → ${balAfter}`);
  const cnUrl = page.url();
  const applyBtn = page.getByTestId('credit-apply');
  if (await applyBtn.count()) {
    await applyBtn.first().click(); await page.waitForTimeout(1500);
    await shot(page, D, '19-credit-apply-dialog');
    await dump(page, 'apply dialog');
    await page.getByTestId('apply-confirm').click().catch((e) => check('apply confirm', false, e.message));
    await page.waitForTimeout(3000);
    await shot(page, D, '20-credit-note-applied');
    const after = await must('GET', `/sales/invoices/${inv1.id}`, null, s.token);
    check('credit applied reduces INV/0001 due', Number(after.amount_due) < 892, `due ${after.amount_due}`);
    s.inv1Due = after.amount_due;
  } else check('credit note offers "Apply to open invoice"', false, `no credit-apply on ${cnUrl}`);
  await go(page, '/sales/credit-notes', 2500);
  await shot(page, D, '21-credit-notes-list');

  // ── SAL-05 void INV/0001 (payment 500 → advance) ──
  const riceB = await stock(s, s.rice);
  await go(page, `/sales/invoices/${inv1.id}`, 3000);
  await page.getByTestId('document-void').click().catch((e) => check('Void button', false, e.message));
  await page.waitForTimeout(1500);
  await dump(page, 'void dialog');
  const vd = await page.getByRole('dialog').innerText().catch(() => '');
  console.log('VOID DIALOG', vd.replace(/\n/g, ' | '));
  check('void dialog lists consequences (stock, khata, payments → advance)', /Stock/.test(vd) && /Khata/.test(vd) && /advance/.test(vd), vd.replace(/\n/g, ' | '));
  await page.getByPlaceholder('e.g. Duplicate bill').fill('Du').catch(() => {});
  await page.getByTestId('void-confirm').click().catch(() => {});
  await page.waitForTimeout(800);
  check('void reason < 3 chars refused', /at least 3 characters/.test(await page.getByRole('dialog').innerText().catch(() => '')));
  await page.getByPlaceholder('e.g. Duplicate bill').fill('Customer cancelled order');
  await shot(page, D, '22-void-dialog');
  await page.getByTestId('void-confirm').click();
  await page.waitForTimeout(3500);
  await shot(page, D, '23-void-follow-up');
  await dump(page, 'after void');
  await page.getByTestId('void-follow-up-done').click().catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(1500);
  await shot(page, D, '24-invoice-voided-detail');
  const v = await must('GET', `/sales/invoices/${inv1.id}`, null, s.token);
  check('voided invoice keeps number INV/26-27/0001', v.status === 'void' && v.number === 'INV/26-27/0001', `${v.status} ${v.number}`);
  const riceA = await stock(s, s.rice);
  check('void restores rice stock (+2)', Number(riceA) - Number(riceB) === 2, `${riceB} → ${riceA}`);
  const rb = await bal(s, s.ramesh);
  check('after void Ramesh is in advance (payment released as advance)', Number(rb) < 0 || /-/.test(String(rb)), `balance ${rb}`);
  const p1 = await must('GET', `/parties/${s.ramesh}`, null, s.token);
  console.log('Ramesh summary after void', JSON.stringify(p1.summary));

  // ── SAL-01 estimate → send → accept → convert ──
  await go(page, '/sales/estimates', 2500);
  await shot(page, D, '25-estimates-list-empty');
  await page.getByTestId('estimate-new').first().click().catch(() => go(page, '/sales/estimates/new', 0));
  await page.waitForTimeout(3000);
  await pickParty(page, 'Ramesh Traders');
  await addItem(page, 'Basm', 'Basmati Rice 5kg');
  await page.locator('input[aria-label^="Qty"]').nth(0).fill('5');
  await page.waitForTimeout(4000);
  await shot(page, D, '26-estimate-editor');
  await dump(page, 'estimate editor');
  const btns = await page.locator('main button').allInnerTexts();
  console.log('EST BUTTONS', btns.join(' / '));
  const save = page.getByRole('button', { name: /^(Save|Save estimate|Issue|Create|Save & send|Send)$/ });
  if (await page.getByTestId('invoice-issue').count()) await page.getByTestId('invoice-issue').click(); else await save.first().click();
  await page.waitForTimeout(3000);
  await shot(page, D, '27-estimate-saved');
  await dump(page, 'estimate after save');
  const ests = await must('GET', '/sales/estimates?page_size=10', null, s.token);
  const est = (ests.results ?? ests)[0];
  console.log('EST', JSON.stringify(est).slice(0, 300));
  if (est) {
    await go(page, `/sales/estimates/${est.id}`, 3000);
    await dump(page, 'estimate detail');
    const sent = page.getByRole('button', { name: /Mark (as )?sent|Send/ }).first();
    if (await sent.count()) { await sent.click(); await page.waitForTimeout(2000); }
    await page.getByTestId('estimate-accept').click().catch((e) => check('estimate accept button', false, e.message));
    await page.waitForTimeout(2000);
    await page.getByRole('dialog').getByRole('button', { name: /Accept|Mark accepted|Confirm/ }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const e2 = await must('GET', `/sales/estimates/${est.id}`, null, s.token);
    check('estimate accepted', /accepted/.test(e2.status), e2.status);
    await shot(page, D, '28-estimate-accepted');
    await page.getByTestId('estimate-convert').click().catch((e) => check('convert button', false, e.message));
    await page.waitForTimeout(1500);
    await shot(page, D, '29-estimate-convert-dialog');
    await page.getByRole('dialog').getByRole('button', { name: /Create invoice|Convert/ }).last().click().catch(() => {});
    await page.waitForTimeout(3500);
    check('convert lands on a draft invoice editor', /sales\/invoices\/.+\/edit/.test(page.url()), page.url());
    await shot(page, D, '30-converted-draft-invoice');
    const e3 = await must('GET', `/sales/estimates/${est.id}`, null, s.token);
    check('estimate marked converted with link', /converted/.test(e3.status) && !!e3.converted_to_id, `${e3.status} ${e3.converted_to_id}`);
  } else check('estimate created', false, 'no estimate in list');
  await go(page, '/sales/estimates', 2500);
  await shot(page, D, '31-estimates-list');
  check('flows page errors none', page.errors.length === 0, page.errors.join(' / '));
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  await ctx.close();
}

async function imports(browser, s) {
  const D = 'desktop';
  const { ctx, page } = await login(browser, s);
  await go(page, '/imports', 2500);
  await shot(page, D, '32-imports-home');
  await dump(page, 'imports');
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
    page.getByRole('link', { name: /template/i }).first().click().catch(() => page.getByRole('button', { name: /template/i }).first().click().catch(() => {})),
  ]);
  check('download parties template', !!dl, dl ? dl.suggestedFilename() : 'no download');
  const bad = [
    'name,mobile,type,opening_balance,opening_type,opening_date,gstin,state',
    'Verma General Store,9823011111,customer,2300.00,to_receive,01/04/2026,,Maharashtra',
    'Patil Dairy,9823022222,customer,850.50,to_receive,01/04/2026,,27',
    'Joshi Suppliers,9823033333,supplier,15000,to_pay,01/04/2026,,Maharashtra',
    'X,12345,customer,abc,to_receive,31/02/2026,,Maharashtra',
    'Kulkarni Stores,98230444,customer,500,sideways,01/04/2026,BADGSTIN,Narnia',
  ].join('\n');
  const good = bad.split('\n').slice(0, 4).join('\n') + '\nKulkarni Stores,9823044444,customer,500,to_receive,01/04/2026,,Maharashtra';
  writeFileSync('/tmp/claude-0/parties-bad.csv', bad); writeFileSync('/tmp/claude-0/parties-good.csv', good);
  const choose = page.getByRole('link', { name: 'Choose', exact: true }).first();
  if (await choose.count()) { await choose.click().catch(() => {}); await page.waitForTimeout(1000); }
  await page.locator('input[type=file]').first().setInputFiles('/tmp/claude-0/parties-bad.csv');
  await page.waitForTimeout(1500);
  const up = page.getByRole('button', { name: /^(Check file|Continue|Next)$/ }).first();
  if (await up.count()) await up.click().catch(() => {});
  await page.waitForTimeout(12000);
  await shot(page, D, '33-imports-errors');
  const et = await body(page);
  await dump(page, 'import check');
  check('error table lists bad rows', /2 rows have problems|rows have problems/.test(et) && /Problem/.test(et));
  const [pdl] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
    page.getByRole('button', { name: 'Download file with problems' }).click().catch(() => page.getByRole('link', { name: 'Download file with problems' }).click().catch(() => {})),
  ]);
  if (pdl) { const pth = `/tmp/claude-0/${pdl.suggestedFilename()}`; await pdl.saveAs(pth); console.log('PROBLEMS CSV', readFileSync(pth, 'utf8').slice(0, 600)); }
  check('problems CSV downloads', !!pdl);
  // start over with the fixed file
  await page.getByRole('button', { name: /Cancel import/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByRole('dialog').getByRole('button', { name: /Cancel import/ }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await go(page, '/imports', 2500);
  if (await choose.count()) { await choose.click().catch(() => {}); await page.waitForTimeout(1000); }
  await page.locator('input[type=file]').first().setInputFiles('/tmp/claude-0/parties-good.csv');
  await page.waitForTimeout(1500);
  if (await up.count()) await up.click().catch(() => {});
  await page.waitForTimeout(12000);
  await shot(page, D, '34-imports-ready');
  await dump(page, 'import ready');
  await page.getByRole('button', { name: /Import \d+ (customers|rows)/ }).first().click().catch((e) => check('commit button', false, e.message));
  await page.waitForTimeout(15000);
  await shot(page, D, '35-imports-done');
  await dump(page, 'import done');
  const ps = await must('GET', '/parties?page_size=50', null, s.token);
  const names = (ps.results ?? ps).map((x) => `${x.name}:${x.balance}`);
  check('imported parties with opening balances', names.some((n) => /Verma General Store:2300/.test(n)) && names.some((n) => /Joshi Suppliers:-?15000/.test(n)), names.join(', '));
  // exports
  await go(page, '/parties', 3000);
  const [ex] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.getByRole('button', { name: /Export|CSV/ }).first().click().catch(() => {})]);
  await page.waitForTimeout(1000);
  if (!ex) { const [ex2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.getByRole('menuitem', { name: /CSV|Export/ }).first().click().catch(() => {})]); check('export parties CSV', !!ex2, ex2?.suggestedFilename()); }
  else check('export parties CSV', true, ex.suggestedFilename());
  await shot(page, D, '36-parties-export');
  await go(page, '/items', 3000);
  if (!/items/.test(page.url())) await go(page, '/items', 3000);
  const [ex3] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.getByRole('button', { name: /Export|CSV/ }).first().click().catch(() => {})]);
  let ok3 = !!ex3;
  if (!ok3) { const [ex4] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.getByRole('menuitem', { name: /CSV|Export/ }).first().click().catch(() => {})]); ok3 = !!ex4; }
  check('export items CSV', ok3, page.url());
  await shot(page, D, '37-items-export');
  check('imports page errors none', page.errors.length === 0, page.errors.join(' / '));
  await ctx.close();
}

async function data(browser, s) {
  const D = 'desktop';
  const { ctx, page } = await login(browser, s);
  await go(page, '/settings/data', 3000);
  await shot(page, D, '38-your-data');
  await dump(page, 'your data');
  await page.getByRole('button', { name: /export|Request/i }).first().click().catch((e) => check('request export button', false, e.message));
  await page.waitForTimeout(2000);
  if (await page.getByRole('dialog').count()) { await shot(page, D, '39-export-dialog'); await page.getByRole('dialog').getByRole('button', { name: /export|Request|Start|Confirm/i }).last().click().catch(() => {}); }
  let dlz = null;
  for (let i = 0; i < 12 && !dlz; i++) {
    await page.waitForTimeout(5000);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
    const d = page.getByRole('button', { name: /Download/ }).or(page.getByRole('link', { name: /Download/ }));
    if (await d.count()) { [dlz] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), d.first().click()]); }
  }
  await shot(page, D, '40-your-data-export-ready');
  check('export ZIP downloads', !!dlz && /\.zip$/.test(dlz?.suggestedFilename() ?? ''), dlz?.suggestedFilename());
  if (dlz) { await dlz.saveAs('/tmp/claude-0/export.zip'); }
  await page.getByRole('button', { name: /Delete/ }).first().click().catch((e) => check('delete button', false, e.message));
  await page.waitForTimeout(1500);
  const dd = await page.getByRole('dialog').innerText().catch(() => '');
  console.log('DELETE DIALOG', dd.replace(/\n/g, ' | '));
  check('delete dialog shows 30-day cool-off', /30/.test(dd), dd.replace(/\n/g, ' | '));
  await shot(page, D, '41-delete-dialog');
  // try to fully request, then cancel
  const inputs = page.getByRole('dialog').locator('input');
  for (let i = 0; i < await inputs.count(); i++) { const t = await inputs.nth(i).getAttribute('type'); if (t === 'password') await inputs.nth(i).fill(s.password); else if (t === 'checkbox') await inputs.nth(i).check().catch(() => {}); else await inputs.nth(i).fill('Sharma Kirana Store').catch(() => {}); }
  await page.getByRole('dialog').getByRole('button', { name: /Delete|Request/ }).last().click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, D, '42-delete-scheduled');
  await dump(page, 'after delete request');
  const cancel = page.getByRole('button', { name: /Cancel deletion|Keep|Cancel/ }).first();
  if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(1000); if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: /Cancel deletion|Keep|Yes|Cancel/ }).last().click().catch(() => {}); await page.waitForTimeout(2000); }
  await shot(page, D, '43-delete-cancelled');
  await dump(page, 'after cancel');
  const me = await api('GET', '/tenants/current', null, s.token);
  check('tenant still active after cancel', me.status === 200, `${me.status} ${JSON.stringify(me.body?.data?.deletion_requested_at ?? me.body?.data?.status ?? '')}`);
  await ctx.close();
}

async function phone(browser, s) {
  const list = await must('GET', '/sales/invoices?page_size=50', null, s.token);
  const rows = list.results ?? list;
  const inv2 = rows.find((x) => /0001$/.test(x.number ?? ''));
  const cns = await must('GET', '/sales/credit-notes?page_size=5', null, s.token);
  const cn = (cns.results ?? cns)[0];
  const ests = await must('GET', '/sales/estimates?page_size=5', null, s.token);
  const est = (ests.results ?? ests)[0];
  const draft = rows.find((x) => x.status === 'draft');
  const screens = [
    ['01-invoices-list', '/sales/invoices'], ['02-invoice-editor-new', '/sales/invoices/new'],
    ['03-invoice-draft', draft ? `/sales/invoices/${draft.id}/edit` : null], ['04-invoice-detail', `/sales/invoices/${inv2.id}`],
    ['07-estimates-list', '/sales/estimates'], ['08-estimate-detail', est ? `/sales/estimates/${est.id}` : null],
    ['09-credit-notes-list', '/sales/credit-notes'], ['10-credit-note-detail', cn ? `/sales/credit-notes/${cn.id}` : null],
    ['11-imports', '/imports'], ['12-your-data', '/settings/data'],
  ];
  for (const w of [390, 360]) {
    const { ctx, page } = await login(browser, s, { width: w, height: 844 });
    for (const [n, path] of screens) {
      if (!path) continue;
      await go(page, path, 3000);
      const ov = await overflow(page);
      check(`${w}px ${n} no horizontal overflow`, ov <= 1, `${ov}px`);
      if (w === 390) await shot(page, 'phone', n);
      if (n === '02-invoice-editor-new' && w === 390) {
        await addItem(page, 'Basm', 'Basmati Rice 5kg').catch(() => {});
        await page.waitForTimeout(1000);
        await shot(page, 'phone', '02b-invoice-editor-line');
        check(`${w}px editor with a line no overflow`, (await overflow(page)) <= 1, `${await overflow(page)}px`);
        await page.getByTestId('invoice-issue').click().catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, 'phone', '02c-payment-drawer');
        await page.keyboard.press('Escape');
      }
      if (n === '04-invoice-detail' && w === 390) {
        await page.emulateMedia({ media: 'print' }); await shot(page, 'phone', '05-print-a4'); await page.emulateMedia({ media: 'screen' });
        await page.getByTestId('print-thermal-action').click().catch(() => {}); await page.waitForTimeout(1000);
        await page.emulateMedia({ media: 'print' }); await shot(page, 'phone', '06-print-thermal'); await page.emulateMedia({ media: 'screen' });
        await page.getByTestId('document-void').click().catch(() => {}); await page.waitForTimeout(1200);
        await shot(page, 'phone', '04b-void-dialog'); await page.keyboard.press('Escape');
      }
      if (w === 390) {
        const hdr = await page.evaluate(() => [...document.querySelectorAll('main button')].filter((b) => b.getBoundingClientRect().top < 140).map((b) => `${(b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 20)}@${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
        console.log(`HEADER ${n}:`, hdr.join(', '));
      }
    }
    check(`${w}px page errors none`, page.errors.length === 0, page.errors.join(' / '));
    await ctx.close();
  }
}

async function hindi(browser, s) {
  const list = await must('GET', '/sales/invoices?page_size=50', null, s.token);
  const inv2 = (list.results ?? list).find((x) => /0001$/.test(x.number ?? ''));
  for (const [dir, w] of [['desktop', 1280], ['phone', 390]]) {
    const { ctx, page } = await login(browser, s, { width: w, height: w > 500 ? 860 : 844, hi: true });
    await go(page, '/sales/invoices/new', 3500);
    await addItem(page, 'Basm', 'Basmati Rice 5kg').catch(() => {});
    await shot(page, dir, '90-hi-invoice-editor');
    const t = await body(page);
    const eng = ['Save draft', 'Place of supply', 'Grand total', 'Subtotal', 'Walk-in'].filter((x) => t.includes(x));
    check(`${dir} Hindi editor has no leftover English labels`, eng.length === 0, eng.join(', '));
    await go(page, `/sales/invoices/${inv2.id}`, 3500);
    await shot(page, dir, '91-hi-invoice-detail');
    await go(page, '/imports', 3000);
    await shot(page, dir, '92-hi-imports');
    if (w === 390) check('390 Hindi imports no overflow', (await overflow(page)) <= 1);
    await ctx.close();
  }
}
Object.assign(phases, { flows, imports, data, phone, hindi });

async function void2(browser, s) {
  const D = 'desktop';
  const list = await must('GET', '/sales/invoices?page_size=50', null, s.token);
  const rows = list.results ?? list;
  const ests = await must('GET', '/sales/estimates?page_size=5', null, s.token);
  const ed = await must('GET', `/sales/estimates/${(ests.results ?? ests)[0].id}`, null, s.token);
  console.log('EST status/links', ed.status, JSON.stringify(ed.links).slice(0, 300), ed.converted_to_id);
  check('estimate shows converted + link to invoice', /converted/.test(ed.status) && JSON.stringify(ed.links ?? {}).includes('invoice'), `${ed.status}`);
  const draft = { id: ed.links.converted_to.id };
  const iss = await api('POST', `/sales/invoices/${draft.id}/issue`, { payment: { mode_breakup: [{ mode: 'upi', amount: '1000.00' }] } }, s.token);
  console.log('issue converted', iss.status, iss.body?.data?.number, iss.body?.error?.message);
  const { ctx, page } = await login(browser, s);
  for (const [inv, label] of [[draft.id, 'paid-party'], [(rows.find((x) => /0001$/.test(x.number ?? '')) ?? {}).id, 'credit-igst']]) {
    const before = await must('GET', `/sales/invoices/${inv}`, null, s.token);
    const pid = before.party.id;
    const b0 = await bal(s, pid); const itemId = before.lines[0].item_id ?? before.lines[0].item?.id; const st0 = itemId ? await stock(s, itemId) : null;
    await go(page, `/sales/invoices/${inv}`, 3000);
    await page.getByTestId('document-void').click();
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('e.g. Duplicate bill').fill('Customer cancelled order');
    console.log('VOID', label, (await page.getByRole('dialog').innerText()).replace(/\n/g, ' | '));
    if (label === 'paid-party') await shot(page, D, '22b-void-dialog-paid');
    await page.getByTestId('void-confirm').click();
    await page.waitForTimeout(3000);
    console.log('FOLLOW', label, (await page.getByRole('dialog').innerText().catch(() => '')).replace(/\n/g, ' | '));
    if (label === 'paid-party') await shot(page, D, '23b-void-follow-up-advance');
    await page.getByTestId('void-follow-up-done').click().catch(() => {});
    await page.waitForTimeout(1500);
    if (label === 'paid-party') await shot(page, D, '24b-invoice-voided');
    const after = await must('GET', `/sales/invoices/${inv}`, null, s.token);
    const b1 = await bal(s, pid); const st1 = itemId ? await stock(s, itemId) : null;
    check(`void ${label}: status void, number kept ${after.number}`, after.status === 'void' && after.number === before.number, `${after.status} ${after.number} reason=${after.void_reason}`);
    check(`void ${label}: stock restored`, Number(st1) - Number(st0) > 0, `${st0} → ${st1}`);
    check(`void ${label}: khata reversed`, Number(b1) < Number(b0), `${b0} → ${b1}`);
    const t = await body(page);
    check(`void ${label}: detail shows Void banner with reason`, /Voided on/.test(t) && /Customer cancelled order/.test(t));
  }
  const rb = await must('GET', `/parties/${s.ramesh}`, null, s.token);
  console.log('Ramesh after', JSON.stringify(rb.summary));
  await ctx.close();
}
phases.void2 = void2;


const browser = PHASE === 'setup' ? null : await chromium.launch({ executablePath: undefined });
let s = existsSync(STATE) && PHASE !== 'setup' && PHASE !== 'all' ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
if (s) s.token = (await must('POST', '/auth/login', { email: s.email, password: s.password })).access_token;
try {
  if (PHASE === 'setup' || PHASE === 'all') s = await setup();
  if (PHASE === 'sales' || PHASE === 'all') await sales(browser, s);
  for (const ph of (PHASE === 'all' ? ['flows', 'imports', 'data', 'phone', 'hindi'] : PHASE.split(','))) if (!['setup', 'sales'].includes(ph)) { try { await phases[ph](browser, s); } catch (e) { check(`phase ${ph} crashed`, false, e.stack); } }
} catch (e) { check(`phase ${PHASE} crashed`, false, e.stack); }
await browser?.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
