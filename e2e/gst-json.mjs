// Shop item 2 — the GSTR-1 / GSTR-3B files for the GST offline tool, on a live stack.
//
// Seeds a GST shop through the API with last month's bills (a B2B invoice to a
// registered customer with two rates, a walk-in sale, a return), then:
//   * downloads both files through the API and checks their shape and figures
//     against the GST summary for the same month;
//   * walks /reports/gst-summary at 1280 and 390 px, presses GSTR-1 JSON and
//     GSTR-3B JSON, and reads the files the browser saved;
//   * on this month (still running) checks the refusal reaches the screen.
// Every screen is measured and photographed into /tmp/e2e-shots/gst-json.
//
//   node e2e/gst-json.mjs        (PW_CHROMIUM=<path> to use a Chromium already installed)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { api, must, uniq, PASSWORD } from './lib/fixtures.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/gst-json';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed, state = '27') => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `${state}${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => {
    const p = B36.indexOf(ch) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  });
  return body + B36[(36 - (sum % 36)) % 36];
};
const now = new Date(Date.now() + 5.5 * 3600e3);
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const LM = lastMonth.toISOString().slice(0, 7); // YYYY-MM
const FP = `${LM.slice(5, 7)}${LM.slice(0, 4)}`;
const ON = `${LM}-10`;

// ── Seed ────────────────────────────────────────────────────────────────────
const email = `gstjson-${uniq()}@e2e.test`;
let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'GST QA Owner' })).access_token;
const ten = await must('POST', '/tenants', { name: 'Shree Ganesh Traders', business_type: 'retail', state_code: '27' }, tok);
tok = ten.access_token ?? tok;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
const stamp = Date.now();
const GSTIN = gstinFor(stamp);
await must('PATCH', '/tenants/current', {
  gst_type: 'regular', gstin: GSTIN,
  address: { line1: '4 Station Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
}, tok);
const nos = (await must('GET', '/units', null, tok)).find((u) => u.code === 'NOS');
const mkItem = (name, price, tax, hsn) => must('POST', '/items', {
  name, unit_id: nos.id, selling_price: price, purchase_price: '100.00', tax_code: tax, hsn_sac: hsn,
  opening_stock: { qty: '50', unit_cost: '100.00' },
}, tok);
const rice = await mkItem('Basmati Rice 5kg', '450.00', 'GST5', '1006');
const soap = await mkItem('Detergent 1kg', '95.00', 'GST18', '3402');
const CUSTOMER_GSTIN = gstinFor(stamp + 7);
const ramesh = await must('POST', '/parties', {
  name: 'Ramesh Traders', is_customer: true, state_code: '27', gstin: CUSTOMER_GSTIN, gst_registration: 'regular',
}, tok);
const inv = async (body, payment) => {
  const r = await api('POST', '/sales/invoices?issue=true', { ...body, ...(payment ? { payment } : {}) }, tok);
  if (r.status >= 400) throw new Error(`invoice ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
  return r.body.data;
};
const line = (item, qty) => ({ item_id: item.id, qty: String(qty) });
const b2b = await inv({ party_id: ramesh.id, document_date: ON, due_on: ON, lines: [line(rice, 2), line(soap, 4)] });
await inv({ walk_in_name: 'Walk-in', document_date: ON, lines: [line(rice, 1)] },
  { payment_date: ON, mode_breakup: [{ mode: 'cash', amount: '473.00' }] });
const riceLine = b2b.lines.find((l) => l.item_id === rice.id);
let r = await api('POST', '/sales/credit-notes', {
  against_id: b2b.id, party_id: ramesh.id, document_date: ON, reason: 'sales_return', restock: true,
  lines: [{ item_id: rice.id, qty: '1', against_line_id: riceLine.id }],
}, tok);
check('seed: credit note draft', r.status < 300, `${r.status} ${JSON.stringify(r.body?.error ?? '').slice(0, 300)}`);
if (r.body?.data) {
  r = await api('POST', `/sales/credit-notes/${r.body.data.id}/issue`, {}, tok);
  check('seed: credit note issued', r.status < 300, `${r.status}`);
}

// ── Through the API ─────────────────────────────────────────────────────────
const file = async (kind) => {
  const res = await api('GET', `/reports/gst-returns/${kind}?period=${LM}`, null, tok);
  return res;
};
const g1 = await file('gstr1');
check('GSTR-1: 200 with a JSON body', g1.status === 200 && typeof g1.body === 'object', `${g1.status} ${JSON.stringify(g1.body).slice(0, 300)}`);
const one = g1.body;
check('GSTR-1: gstin, fp, hash', one.gstin === GSTIN && one.fp === FP && one.hash === 'hash', JSON.stringify([one.gstin, one.fp]));
const b2bInv = one.b2b?.[0]?.inv?.[0];
check('GSTR-1: the B2B invoice under its customer, one itms per rate', one.b2b?.[0]?.ctin === CUSTOMER_GSTIN && b2bInv?.itms?.length === 2, JSON.stringify(b2bInv?.itms));
check('GSTR-1: money is a number', typeof b2bInv?.val === 'number', typeof b2bInv?.val);
check('GSTR-1: the return is in cdnr, positive', one.cdnr?.[0]?.nt?.[0]?.ntty === 'C' && one.cdnr[0].nt[0].itms[0].itm_det.txval === 450, JSON.stringify(one.cdnr));
check('GSTR-1: walk-in sale in b2cs', one.b2cs?.some((row) => row.rt === 5 && row.txval === 450), JSON.stringify(one.b2cs));
check('GSTR-1: no empty sections', !('b2cl' in one) && !('nil' in one));
const screen = (await api('GET', `/reports/gst-summary?period=${LM}`, null, tok)).body.data;
const nature = Object.fromEntries(screen.outward.by_nature.rows.map((row) => [row.nature, row]));
const b2bTx = one.b2b.flatMap((g) => g.inv).flatMap((i) => i.itms).reduce((a, i) => a + i.itm_det.txval, 0);
check('GSTR-1 equals the screen: B2B taxable', Math.abs(b2bTx - Number(nature.b2b.taxable_value)) < 0.005, `${b2bTx} vs ${nature.b2b.taxable_value}`);
const g3 = await file('gstr3b');
check('GSTR-3B: 3.1(a) equals the screen', g3.status === 200 && g3.body.sup_details.osup_det.txval === Number(screen.gstr3b['3.1(a)'].taxable), JSON.stringify(g3.body.sup_details?.osup_det));
const running = await api('GET', `/reports/gst-returns/gstr1?period=${now.toISOString().slice(0, 7)}`, null, tok);
check('this month is refused: period_not_closed', running.status === 409 && running.body?.error?.code === 'period_not_closed', `${running.status}`);

// ── The screen ──────────────────────────────────────────────────────────────
const measure = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  cut: Array.from((document.querySelector('main') ?? document).querySelectorAll('p, span, div, h1, h2, h3'))
    .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
    .filter((node) => !node.className.toString().includes('sr-only'))
    .filter((node) => node.scrollWidth - node.clientWidth > 1)
    .map((node) => (node.textContent ?? '').trim())
    .slice(0, 6),
}));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'en-IN', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (res) => {
    const probe = /\/auth\/(me|refresh)$/.test(new URL(res.url()).pathname);
    const expected = res.url().includes('/gst-returns/') && res.status() === 409;
    if (res.status() >= 400 && res.url().includes('/api/') && !probe && !expected) bad.push(`${res.status()} ${res.url().replace(/.*\/api\/v1/, '')}`);
  });
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FE}/reports/gst-summary?period=lastMonth`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const look = async (name) => {
    const m = await measure(page);
    check(`${size} ${name}: fits the screen`, m.overflow === 0 && m.cut.length === 0, JSON.stringify(m));
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };
  await look('gstr1-tab');
  const save = async (label) => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: label }).click(),
    ]);
    const path = `${ROOT}/${size}-${download.suggestedFilename()}`;
    await download.saveAs(path);
    return { name: download.suggestedFilename(), body: JSON.parse(readFileSync(path, 'utf8')) };
  };
  const saved1 = await save('GSTR-1 JSON');
  check(`${size}: GSTR-1 saved under the server's name`, saved1.name === `GSTR1_${GSTIN}_${FP}.json` && saved1.body.fp === FP, saved1.name);
  await page.waitForTimeout(800);
  await look('gstr1-saved');
  await page.getByRole('tab', { name: 'GSTR-3B' }).click();
  await page.waitForTimeout(800);
  const saved3 = await save('GSTR-3B JSON');
  check(`${size}: GSTR-3B saved`, saved3.name === `GSTR3B_${GSTIN}_${FP}.json` && saved3.body.ret_period === FP, saved3.name);
  await look('gstr3b-tab');
  await page.goto(`${FE}/reports/gst-summary`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'GSTR-1 JSON' }).click();
  await page.waitForTimeout(1500);
  check(`${size}: this month says why it cannot be filed yet`, (await page.locator('body').innerText()).includes('once the month has ended'));
  await page.screenshot({ path: `${ROOT}/${size}-this-month-refused.png`, fullPage: false });
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  check(`${size}: no unexpected failed requests`, bad.length === 0, bad.join(' | '));
  await ctx.close();
}
await browser.close();
writeFileSync(`${ROOT}/account.json`, JSON.stringify({ email }, null, 1));
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
