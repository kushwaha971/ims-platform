// wave1-settings-qa.mjs — QA of Track T1 (PLT-06/07/08/09, WLB-01). Phase X = explore.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { newOwner, must, api, PASSWORD, uniq, addParty } from './lib/fixtures.mjs';
const FE = 'http://localhost:3000';
const OUT = '/tmp/e2e-shots/wave1/settings';
const STATE = `${OUT}/state.json`;
const phase = process.argv[2] ?? 'X';

async function member(owner, role, name) {
  const email = `qa-${role}-${uniq()}@e2e.test`;
  const made = await must('POST', '/members', { full_name: name, email, role }, owner.token);
  let token = (await must('POST', '/auth/login', { email, password: made.password })).access_token;
  await must('POST', '/auth/password/set', { current_password: made.password, new_password: PASSWORD }, token);
  return { email };
}
async function state() {
  if (existsSync(STATE) && !process.argv.includes('--fresh')) return JSON.parse(readFileSync(STATE, 'utf8'));
  const owner = await newOwner({ shop: 'Sharma Kirana Stores', name: 'Rakesh Sharma', prefix: 'w1-owner' });
  await addParty(owner.token, { name: 'Ramesh Traders', opening_balance_amount: '1500.00', opening_balance_direction: 'debit', opening_balance_as_of: '2026-09-01' });
  const staff = await member(owner, 'staff', 'Sunil Staff');
  const acct = await member(owner, 'accountant', 'Anita Accountant');
  const s = { owner: owner.email, staff: staff.email, acct: acct.email };
  writeFileSync(STATE, JSON.stringify(s)); return s;
}
export async function login(browser, email, { width = 1280, height = 800, hi = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  if (hi) await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const s = await state();
console.log(JSON.stringify(s));
const browser = await chromium.launch();
if (phase === 'X') {
  for (const [who, w] of [['owner', 1280], ['owner', 390], ['staff', 390], ['acct', 1280]]) {
    const { ctx, page } = await login(browser, s[who], { width: w, height: w > 500 ? 800 : 844 });
    for (const p of ['/settings', '/settings/profile', '/settings/activity', '/settings/devices', '/settings/branding']) {
      await page.goto(FE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
      const name = `${who}-${w}-${p.replaceAll('/', '_')}`;
      await page.screenshot({ path: `${OUT}/explore/${name}.png`, fullPage: true });
      const txt = (await page.innerText('main').catch(() => page.innerText('body'))).replace(/\n+/g, ' | ').slice(0, 900);
      console.log(`\n## ${name} url=${page.url()} overflow=${await overflow(page)}\n${txt}`);
    }
    await ctx.close();
  }
}

const R = [];
const ok = (id, pass, note = '') => { R.push({ id, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${note}`); };
let CUR = null;
const tryStep = async (id, fn) => { try { await fn(); } catch (e) { ok(id, false, 'ERR ' + e.message.split('\n').slice(0, 6).join(' ').slice(0, 400)); if (CUR) await CUR.screenshot({ path: `${OUT}/explore/err-${id.replace(/\W+/g, '_')}.png` }).catch(() => {}); } };
const shot = async (page, dir, name, full = true) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${dir}/${name}.png`, fullPage: full }); };
const dlgShot = async (page, dir, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${dir}/${name}.png` }); };

async function makePng(browser, hex, path) {
  const p = await browser.newPage({ viewport: { width: 200, height: 200 } });
  await p.setContent(`<div id=l style="width:160px;height:160px;background:${hex};border-radius:24px;display:flex;align-items:center;justify-content:center;color:#fff;font:bold 72px sans-serif">SK</div>`);
  await p.locator('#l').screenshot({ path, omitBackground: true }); await p.close();
}
const LOGO = `${OUT}/logo.png`, SIG = `${OUT}/signature.png`;

function gstin() {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', C = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', r = (a) => a[Math.floor(Math.random() * a.length)];
  const pan = r(L) + r(L) + r(L) + 'P' + r(L) + String(Math.floor(1000 + Math.random() * 8999)) + r(L);
  const base = '27' + pan + '1Z'; let sum = 0;
  for (let i = 0; i < 14; i++) { const v = C.indexOf(base[i]) * (i % 2 ? 2 : 1); sum += Math.floor(v / 36) + (v % 36); }
  return { pan, gstin: base + C[(36 - (sum % 36)) % 36] };
}
async function fixSelects(page) {
  const st = page.getByLabel('State').first();
  if (await st.evaluate((e) => e.tagName).catch(() => '?') === 'SELECT') await st.selectOption('27'); else { await st.click(); await page.getByRole('option', { name: /\(27\)/ }).first().click(); }
  const bt = page.getByLabel('What kind of business?').first();
  if (await bt.evaluate((e) => e.tagName).catch(() => '') === 'SELECT') await bt.selectOption('retail'); else { await bt.click(); await page.getByRole('option', { name: 'Retail shop' }).click(); }
}
async function ownerFlow(dir, width) {
  const { ctx, page } = await login(browser, s.owner, { width, height: width > 500 ? 800 : 844 }); CUR = page;
  const puts = []; page.on('response', (r) => { if (r.request().method() !== 'GET' && r.url().includes('/api/v1/')) puts.push(`${r.request().method()} ${r.url().split('/api/v1')[1]} ${r.status()}`); });
  const token = (await must('POST', '/auth/login', { email: s.owner, password: PASSWORD })).access_token;
  // ---- PLT-06
  await tryStep(`${dir} PLT-06 hub`, async () => {
    await page.goto(`${FE}/settings`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    await shot(page, dir, '01-settings-hub');
    ok(`${dir} PLT-06 overflow`, (await overflow(page)) <= 0, `overflow=${await overflow(page)}`);
    await page.getByText('Block until owner approves').click();
    const ta = page.locator('textarea').first();
    await ta.fill('Namaste , your balance is  at . Please pay by . ');
    await ta.evaluate((el) => el.setSelectionRange(8, 8)); await ta.focus();
    await page.getByRole('button', { name: 'Customer name' }).first().click();
    await page.waitForTimeout(300);
    const v = await ta.inputValue(); ok(`${dir} PLT-06 chip inserts placeholder`, v.includes('{party_name}'), JSON.stringify(v));
    await ta.fill('Namaste {party_name}, {business_name} ka {amount} baaki hai, due {due_date}. Pay: {upi_link}');
    await page.waitForTimeout(400);
    const prev = await page.locator('text=Preview').first().locator('xpath=..').innerText();
    ok(`${dir} PLT-06 preview renders`, !/\{/.test(prev), prev.replace(/\n/g, ' ').slice(0, 200));
    ok(`${dir} PLT-06 preview uses own shop name`, prev.includes('Sharma Kirana Stores'), '');
    await shot(page, dir, '02-settings-edited-template');
    puts.length = 0;
    await page.getByRole('button', { name: 'Save changes' }).first().click(); await page.waitForTimeout(1500);
    ok(`${dir} PLT-06 save`, puts.some((x) => x.startsWith('PUT /tenants/current/settings 200')), puts.join('; '));
    const st = await api('GET', '/tenants/current/settings', null, token);
    ok(`${dir} PLT-06 persisted`, st.body.data.values['ledger.credit_limit_mode'].mode === 'block' && st.body.data.values['ledger.reminder_templates'].en.includes('{due_date}'), JSON.stringify(st.body.data.values['ledger.credit_limit_mode']));
  });
  await tryStep(`${dir} PLT-06 reset`, async () => {
    await page.getByRole('button', { name: /Reset to defaults/ }).first().click(); await page.waitForTimeout(600);
    await dlgShot(page, dir, '03-settings-reset-dialog');
    const d = page.getByRole('dialog'); ok(`${dir} PLT-06 reset asks confirmation`, await d.count() > 0, (await d.innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 200));
    await page.keyboard.press('Escape');
  });
  await tryStep(`${dir} PLT-06 412`, async () => {
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    // someone else saves meanwhile
    const cur = await api('GET', '/tenants/current/settings', null, token);
    const mode = cur.body.data.values['ledger.credit_limit_mode'].mode === 'warn' ? 'off' : 'warn';
    const put = await api('PUT', '/tenants/current/settings', { values: { 'ledger.credit_limit_mode': { mode } } }, token, { 'If-Match': cur.body.data.etag });
    await page.getByText('Do nothing').first().click();
    puts.length = 0;
    await page.getByRole('button', { name: 'Save changes' }).first().click(); await page.waitForTimeout(1500);
    const d = page.getByRole('dialog');
    ok(`${dir} PLT-06 412 dialog`, puts.some((x) => x.includes('settings 412')) && await d.count() > 0, `bgput=${put.status} ${puts.join('; ')} | ${(await d.innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 200)}`);
    await dlgShot(page, dir, '04-settings-stale-save-dialog');
    await page.keyboard.press('Escape');
  });
  await tryStep(`${dir} PLT-06 modules`, async () => {
    await page.goto(`${FE}/settings`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const sw = page.getByRole('switch').first();
    const before = await sw.getAttribute('aria-checked') ?? String(await sw.isChecked());
    puts.length = 0; await sw.click(); await page.waitForTimeout(800);
    const dlg = page.getByRole('dialog');
    if (await dlg.count()) { await dlgShot(page, dir, '05-settings-module-off-confirm'); await dlg.getByRole('button').last().click(); await page.waitForTimeout(1200); }
    const after = await sw.getAttribute('aria-checked') ?? String(await sw.isChecked());
    ok(`${dir} PLT-06 module switch saves`, before !== after && puts.some((x) => / 200/.test(x)), `${before}->${after} ${puts.join('; ')}`);
    await shot(page, dir, '06-settings-module-stock-off', false);
    const t = await api('GET', '/tenants/current', null, token); console.log('enabled_modules', JSON.stringify(t.body.data.enabled_modules));
    puts.length = 0; await sw.click(); await page.waitForTimeout(800);
    if (await dlg.count()) { await dlg.getByRole('button').last().click(); await page.waitForTimeout(1200); }
    console.log('module back on:', puts.join('; '));
  });
  // ---- PLT-07
  await tryStep(`${dir} PLT-07 profile`, async () => {
    await page.goto(`${FE}/settings/profile`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    ok(`${dir} PLT-07 existing state/business type shown`, !(await page.getByText('Choose your state').isVisible()) , '');
    const fill = async (label, v) => { const f = page.getByLabel(label, { exact: false }).first(); await f.fill(v); };
    await fill('Legal name', 'Sharma Kirana Stores Private Limited');
    await fill('Address line 1', 'Shop 4, MG Road'); await fill('Address line 2', 'Near bus stand');
    await fill('City', 'Nashik'); await fill('PIN code', '422001');
    await page.locator('input[type="tel"]').first().fill('9876543210');
    await fill('Business email', 'sharmakirana@example.com');
    await fill('Account holder name', 'Sharma Kirana Stores'); await fill('Account number', '123456789012');
    await fill('IFSC', 'SBIN0001234'); await fill('Bank name', 'State Bank of India'); await fill('Branch', 'College Road, Nashik');
    await fill('UPI ID', 'sharmakirana@okaxis');
    await page.getByLabel('PAN').first().fill('AAPFU0939F'); // D: empty PAN blocks save (Yup .matches on '')
    const st = page.getByLabel('State').first();
    const tag = await st.evaluate((e) => e.tagName).catch(() => '?');
    if (tag === 'SELECT') await st.selectOption('27'); else { await st.click(); await page.getByRole('option', { name: /\(27\)/ }).first().click().catch(() => {}); }
    const bt = page.getByLabel('What kind of business?').first();
    if (await bt.evaluate((e) => e.tagName).catch(() => '') === 'SELECT') await bt.selectOption('retail'); else { await bt.click(); await page.getByRole('option', { name: 'Retail shop' }).click().catch(() => {}); }
    await page.locator('input[type="file"]').last().setInputFiles(SIG); await page.waitForTimeout(1500);
    await shot(page, dir, '07-profile-filled');
    puts.length = 0; await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(2000);
    ok(`${dir} PLT-07 save`, puts.some((x) => x.startsWith('PATCH /tenants/current 200')), puts.join('; '));
    const t = await api('GET', '/tenants/current', null, token); const d = t.body.data;
    ok(`${dir} PLT-07 persisted`, d.upi_vpa === 'sharmakirana@okaxis' && d.bank_details?.ifsc === 'SBIN0001234' && d.address?.city === 'Nashik', JSON.stringify({ upi: d.upi_vpa, bank: d.bank_details, addr: d.address, state: d.state_code }));
    const b = await api('GET', '/tenants/current/branding', null, token); ok(`${dir} PLT-07 signature stored`, !!JSON.stringify(b.body.data).match(/signature[^,]*(http|\/)/i), JSON.stringify(b.body.data).slice(0, 300));
    const errs = await page.locator('[role="alert"], .Mui-error, [aria-invalid="true"]').allInnerTexts(); if (errs.length) console.log('profile errors:', errs.join(' | ').slice(0, 300));
  });
  await tryStep(`${dir} PLT-07 gst`, async () => {
    await page.goto(`${FE}/settings/profile`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await fixSelects(page); // D: selects come back empty after every load
    await page.getByText('Regular GST').click(); await page.waitForTimeout(400);
    const G = gstin(); const g = page.getByLabel('GSTIN').first(); if (await g.count()) await g.fill(G.gstin); await page.getByLabel('PAN').first().fill(G.pan);
    await shot(page, dir, '08-profile-gst-regular');
    puts.length = 0; await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(1200);
    const d = page.getByRole('dialog');
    const has = await d.count() > 0; const txt = has ? (await d.innerText()).replace(/\n/g, ' ') : '';
    ok(`${dir} PLT-07 GST change confirm dialog`, has, txt.slice(0, 200) + ' | ' + puts.join('; '));
    if (has) { await dlgShot(page, dir, '09-profile-gst-change-confirm'); await d.getByRole('button').last().click(); await page.waitForTimeout(1500); }
    ok(`${dir} PLT-07 GST saved`, puts.some((x) => x.startsWith('PATCH /tenants/current 200')), puts.join('; '));
    // 409 gst_type_locked — sales/invoices not built; mock the refusal to see how the UI renders it.
    await page.route('**/api/v1/tenants/current', async (route) => {
      if (route.request().method() === 'PATCH') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'gst_type_locked', message: 'You issued 3 tax invoices this year. GST type can change from 1 April.', details: { count: 3 } }, request_id: 'qa-mock' }) });
      return route.continue();
    });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await fixSelects(page); await page.getByText('Composition scheme').click();
    await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(800);
    if (await page.getByRole('dialog').count()) { await page.getByRole('dialog').getByRole('button').last().click(); }
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    ok(`${dir} PLT-07 409 gst_type_locked shown (mocked)`, /1 April|tax invoices/.test(body), '');
    await dlgShot(page, dir, '10-profile-gst-locked-409-mocked');
    await page.unroute('**/api/v1/tenants/current');
  });
  // ---- WLB-01
  await tryStep(`${dir} WLB-01`, async () => {
    await page.goto(`${FE}/settings/branding`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await page.locator('input[type="file"]').first().setInputFiles(LOGO); await page.waitForTimeout(1200);
    const col = page.getByLabel('Colour code').first();
    await col.fill('#FFEB3B'); await page.waitForTimeout(600);
    const clientTxt = (await page.innerText('main')).match(/.{0,80}(contrast|Readable|Hard to read|Try).{0,120}/i)?.[0];
    await shot(page, dir, '11-branding-low-contrast');
    // server refusal
    const r = await api('PUT', '/tenants/current/branding', { primary_hex: '#FFEB3B' }, token);
    ok(`${dir} WLB-01 400 low_contrast + suggested`, r.status === 400 && r.body.error?.code === 'low_contrast' && !!r.body.error?.details?.suggested_hex, `${r.status} ${JSON.stringify(r.body.error ?? r.body).slice(0, 200)} | UI: ${clientTxt}`);
    puts.length = 0; await page.getByRole('button', { name: 'Save changes' }).click().catch(() => {}); await page.waitForTimeout(1200);
    console.log('low contrast save attempt:', puts.join('; '), (await page.innerText('main')).match(/.{0,60}(darker|suggest|Use ).{0,80}/i)?.[0]);
    await shot(page, dir, '12-branding-low-contrast-save');
    await col.fill('#0F766E'); await page.waitForTimeout(500);
    puts.length = 0; await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(2000);
    ok(`${dir} WLB-01 save`, puts.some((x) => x.startsWith('PUT /tenants/current/branding 200')), puts.join('; '));
    await shot(page, dir, '13-branding-saved');
    const b = await api('GET', '/tenants/current/branding', null, token); console.log('branding', JSON.stringify(b.body.data).slice(0, 400));
  });
  await tryStep(`${dir} WLB-01 applied`, async () => {
    const p2 = await ctx.newPage(); const samples = [];
    await p2.addInitScript(() => { window.__c = []; let n = 0; const f = () => { const b = document.body && document.body.innerText.length > 20; if (b) window.__c.push(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()); if (n++ < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await p2.goto(`${FE}/parties`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1500);
    const c = await p2.evaluate(() => [...new Set(window.__c)]);
    const vars = await p2.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--color-primary', '--ub-primary', '--primary', '--mui-palette-primary-main', '--color-brand'].map((k) => `${k}=${cs.getPropertyValue(k).trim()}`).join(' '); });
    
    ok(`${dir} WLB-01 brand colour app-wide, no indigo flash`, c.length > 0 && c.every((x) => x.startsWith('175')) , `colours seen=${c.join(' / ')} vars: ${vars}`);
    await shot(p2, dir, '14-branded-customers-page', false); await p2.close();
  });
  // ---- PLT-08
  await tryStep(`${dir} PLT-08`, async () => {
    await page.goto(`${FE}/settings/activity`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    await shot(page, dir, '15-activity-log');
    ok(`${dir} PLT-08 overflow`, (await overflow(page)) <= 0, `overflow=${await overflow(page)}`);
    const body = await page.innerText('main');
    ok(`${dir} PLT-08 rows dd/mm/yyyy`, /\d{2}\/\d{2}\/\d{4}/.test(body), '');
    await page.getByRole('button', { name: /Last 7 days/ }).click().catch(() => page.getByText('Last 7 days').click()); await page.waitForTimeout(800);
    await page.getByText('Choose dates').click(); await page.waitForTimeout(700);
    const dateTxt = (await page.innerText('body')).match(/\d{1,2} [A-Z][a-z]{2} \d{4}/g);
    ok(`${dir} PLT-08 date control "1 Apr 2026" style`, !!dateTxt, JSON.stringify(dateTxt?.slice(0, 3)));
    await dlgShot(page, dir, '16-activity-choose-dates');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const rowSel = page.getByText(/Changed business profile|Branding/).locator('visible=true').first();
    await rowSel.click(); await page.waitForTimeout(900);
    const dr = page.getByRole('dialog').or(page.locator('.MuiDrawer-paper')).first();
    const dtxt = (await dr.innerText().catch(() => '')).replace(/\n/g, ' | ');
    ok(`${dir} PLT-08 drawer before/after`, /Before|After|→/.test(dtxt), dtxt.slice(0, 400));
    ok(`${dir} PLT-08 IP shown to owner`, /\bIP\b|127\.0\.0/.test(dtxt), '');
    ok(`${dir} PLT-08 bank number masked in audit`, !dtxt.includes('123456789012'), '');
    await dlgShot(page, dir, '17-activity-detail-drawer');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (width > 500) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('link', { name: /Export CSV/ }).click()]);
      const path = `${OUT}/activity-${dir}.csv`; await dl.saveAs(path); const csv = readFileSync(path, 'utf8');
      ok(`${dir} PLT-08 CSV export`, csv.startsWith('When,Who') && csv.split('\n').length > 3, `${dl.suggestedFilename()} rows=${csv.split('\n').length} first=${csv.split('\n')[1]}`);
    }
  });
  // ---- PLT-09
  await tryStep(`${dir} PLT-09`, async () => {
    await page.goto(`${FE}/settings/devices`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    await shot(page, dir, '18-devices');
    const renames = page.getByRole('button', { name: /Rename/ }); await renames.nth(1).click(); await page.waitForTimeout(600);
    const d = page.getByRole('dialog'); await d.getByRole('textbox').fill('Counter billing PC');
    await dlgShot(page, dir, '19-devices-rename-dialog');
    puts.length = 0; await d.getByRole('button', { name: /Save|Rename/ }).last().click(); await page.waitForTimeout(1200);
    ok(`${dir} PLT-09 rename`, puts.some((x) => /PATCH \/auth\/sessions\/.* 200/.test(x)) && (await page.innerText('main')).includes('Counter billing PC'), puts.join('; '));
    const outs = page.getByRole('button', { name: /^Log out \S/ }); const n = await outs.count();
    await outs.nth(n - 1).click(); await page.waitForTimeout(600);
    if (await page.getByRole('dialog').count()) { await dlgShot(page, dir, '20-devices-revoke-confirm'); puts.length = 0; await page.getByRole('dialog').getByRole('button').last().click(); } await page.waitForTimeout(1200);
    ok(`${dir} PLT-09 revoke one`, puts.some((x) => /DELETE \/auth\/sessions\/.* 20/.test(x)), puts.join('; '));
    await page.getByRole('button', { name: /Log out everywhere/ }).click(); await page.waitForTimeout(600);
    await dlgShot(page, dir, '21-devices-logout-everywhere-confirm');
    ok(`${dir} PLT-09 logout-everywhere confirms`, await page.getByRole('dialog').count() > 0, (await page.getByRole('dialog').innerText().catch(() => '')).replace(/\n/g, ' '));
    await page.keyboard.press('Escape');
  });
  console.log(`[${dir}] mutations:`, puts.slice(-5).join('; '));
  await ctx.close();
}
if (phase === 'O') {
  await makePng(browser, '#0F766E', LOGO);
  const p = await browser.newPage({ viewport: { width: 400, height: 140 } });
  await p.setContent(`<div id=s style="width:360px;height:110px;background:#fff;font:italic 48px cursive;color:#1e3a8a;display:flex;align-items:center;justify-content:center">R. Sharma</div>`);
  await p.locator('#s').screenshot({ path: SIG }); await p.close();
  for (const [dir, w] of (process.argv[3] ?? 'desktop:1280,phone:390').split(',').map((x) => x.split(':'))) await ownerFlow(dir, Number(w));
}
async function openAccountMenuDevices(page) {
  const trig = page.getByRole('button').filter({ hasText: /^(RS|SS|AA)/ }).first();
  await trig.click(); await page.waitForTimeout(500);
  const item = page.getByRole('menuitem', { name: /Devices|डिवाइस/ }).or(page.getByRole('link', { name: /Devices|डिवाइस/ })).first();
  const vis = await item.isVisible().catch(() => false);
  return { item, vis };
}
if (phase === 'R') {
  for (const [who, dir, w] of [['staff', 'phone', 390], ['staff', 'desktop', 1280], ['acct', 'desktop', 1280], ['acct', 'phone', 390], ['owner', 'phone', 390]]) {
    const { ctx, page } = await login(browser, s[who], { width: w, height: w > 500 ? 800 : 844 }); CUR = page;
    await tryStep(`${who}-${dir} nav`, async () => {
      await page.goto(`${FE}/parties`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
      if (w > 500) { const nav = await page.locator('nav, aside').first().innerText(); ok(`${who}-${dir} sidebar Settings ${who === 'staff' ? 'hidden' : 'shown'}`, nav.includes('Settings') === (who !== 'staff'), nav.replace(/\n/g, ' ').slice(0, 200)); }
      const { item, vis } = await openAccountMenuDevices(page);
      await dlgShot(page, dir, `30-${who}-account-menu`);
      ok(`${who}-${dir} account menu has Devices`, vis, '');
      if (vis) { await item.click(); await page.waitForURL(/settings\/devices/, { timeout: 8000 }); ok(`${who}-${dir} Devices via menu`, page.url().includes('/settings/devices'), page.url()); }
    });
    if (process.argv.includes('--navonly')) { await ctx.close(); continue; }
    if (who === 'staff') await tryStep(`${who}-${dir} gated pages`, async () => {
      for (const p of ['/settings/activity', '/settings/branding', '/settings/profile']) {
        await page.goto(FE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
        const t = await page.innerText('main').catch(() => ''); const up = page.getByRole('button', { name: /Upload logo|Replace logo/ });
        console.log(`${who}-${dir} ${p} url=${page.url()} uploadEnabled=${(await up.count()) ? await up.first().isEnabled() : 'n/a'} :: ${t.replace(/\n/g, ' ').slice(0, 160)}`);
        await shot(page, dir, `31-staff${p.replaceAll('/', '-')}`, false);
      }
    });
    if (who === 'acct') await tryStep(`${who}-${dir} masking`, async () => {
      await page.goto(`${FE}/settings/profile`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
      const vals = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).join(' '));
      const body = await page.innerText('main');
      ok(`${who}-${dir} account number masked`, !vals.includes('123456789012') && !body.includes('123456789012'), (vals.match(/\S*9012\S*/) || [''])[0]);
      await shot(page, dir, '32-accountant-profile-masked');
      await page.goto(`${FE}/settings/activity`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
      await page.getByText(/Changed business profile/).locator('visible=true').first().click(); await page.waitForTimeout(800);
      const d = (await page.getByRole('dialog').innerText().catch(() => '')).replace(/\n/g, ' | ');
      ok(`${who}-${dir} no IP in drawer`, !/Network address|127\.0\.0/.test(d), d.slice(0, 250));
      ok(`${who}-${dir} audit masks bank`, !d.includes('123456789012'), '');
      await dlgShot(page, dir, '33-accountant-activity-drawer-no-ip');
    });
    if (who === 'owner') await tryStep(`owner phone headers`, async () => {
      for (const p of ['/settings/activity', '/settings/devices', '/settings/branding', '/settings/profile', '/settings']) {
        await page.goto(FE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
        const h = await page.evaluate(() => { const h1 = document.querySelector('main h1') || document.querySelector('h1'); if (!h1) return 'no h1'; const row = h1.closest('header') || h1.parentElement.parentElement; const bs = [...row.querySelectorAll('a,button')].map((b) => { const r = b.getBoundingClientRect(); return `${(b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 20)}:${Math.round(r.width)}x${Math.round(r.height)}@y${Math.round(r.top)}`; }); return `h1@y${Math.round(h1.getBoundingClientRect().top)} ${bs.join(', ')}`; });
        const inputs = await page.evaluate(() => [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]):not([type=file]):not([type=hidden])')].filter((i) => i.offsetParent).map((i) => Math.round(i.getBoundingClientRect().height)).filter((v, i, a) => a.indexOf(v) === i));
        const noPh = await page.evaluate(() => [...document.querySelectorAll('main input[type=text], main input:not([type]), main input[type=email], main input[type=tel]')].filter((i) => i.offsetParent && !i.placeholder).map((i) => i.name || i.id).slice(0, 8));
        console.log(`HEADER ${p}: ${h} | input heights ${inputs} | no-placeholder ${noPh} | overflow ${await overflow(page)}`);
      }
    });
    await ctx.close();
  }
  // Hindi
  if (!process.argv.includes('--navonly')) for (const [dir, w] of [['phone', 390], ['desktop', 1280]]) {
    const { ctx, page } = await login(browser, s.owner, { width: w, height: w > 500 ? 800 : 844, hi: true });
    for (const [p, n] of [['/settings', '40-hi-settings-hub'], ['/settings/profile', '41-hi-business-profile']]) {
      await page.goto(FE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
      await shot(page, dir, n);
      const t = await page.innerText('main'); const eng = (t.match(/\b[A-Z][a-z]{3,}\b/g) || []).filter((x) => !/Sharma|Kirana|Stores|Nashik|Road|India|State|Bank|Private|Limited|Ramesh|College|Near/.test(x));
      console.log(`HI ${dir} ${p} overflow=${await overflow(page)} english-words=${[...new Set(eng)].slice(0, 15)}`);
    }
    await ctx.close();
  }
}
writeFileSync(`${OUT}/results-${phase}.json`, JSON.stringify(R, null, 1));
await browser.close();
