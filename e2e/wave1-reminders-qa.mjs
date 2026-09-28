/**
 * wave1-reminders-qa.mjs — independent QA of wave 1 tracks T2 (LED-05..08, NTF-01)
 * and T4 (EXP-01..03) against a LIVE stack, with screenshots.
 *
 *   node e2e/wave1-reminders-qa.mjs
 * Env: E2E_FRONTEND, E2E_BACKEND, E2E_SHOTS (default /tmp/e2e-shots/wave1/reminders-expenses)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { newOwner, addParty, api, must, uniq, uniqMobile, PASSWORD } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const SHOTS = process.env.E2E_SHOTS ?? '/tmp/e2e-shots/wave1/reminders-expenses';
const BACKEND_DIR = new URL('../backend', import.meta.url).pathname;
for (const d of ['phone', 'desktop']) mkdirSync(`${SHOTS}/${d}`, { recursive: true });

const results = [];
const record = (id, check, ok, detail = '') => {
  results.push({ id, check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${id}] ${check}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`);
};
const psql = (sql) => execFileSync('psql', ['-h', '127.0.0.1', '-U', 'udhaarbook', 'udhaarbook', '-tAq', '-c', sql], { env: { ...process.env, PGPASSWORD: 'udhaarbook' } }).toString().trim();
const djangoShell = (code) => execFileSync('python3', ['manage.py', 'shell', '-c', code], { cwd: BACKEND_DIR }).toString().trim();
const ist = (n = 0) => new Date(Date.now() + n * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);
const SIZES = [{ id: 'phone', width: 390, height: 844 }, { id: 'desktop', width: 1280, height: 860 }];
const shot = async (page, size, name, full = false) => page.screenshot({ path: `${SHOTS}/${size}/${name}.png`, fullPage: full }).catch((e) => console.log('shot fail', name, e.message));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ───────────────────────── seed ─────────────────────────
const owner = await newOwner({ shop: 'Sharma Kirana Store', name: 'Rajesh Sharma', prefix: 'w1-rem' });
const T = owner.token;
const mk = (name, amt, dir, extra = {}) => addParty(T, { name, mobile: uniqMobile(), ...(amt ? { opening_balance_amount: amt, opening_balance_direction: dir, opening_balance_as_of: ist(-30) } : {}), ...extra });
const ramesh = await mk('Ramesh Traders', '2300.00', 'debit');
const suresh = await mk('Suresh Kumar', '1850.00', 'debit');
const anita = await mk('Anita Devi', '4200.00', 'debit');
const mohan = await addParty(T, { name: 'Mohan Lal', opening_balance_amount: '950.00', opening_balance_direction: 'debit', opening_balance_as_of: ist(-30) });
const kavita = await mk('Kavita Sweets', '600.00', 'debit');
const gupta = await mk('Gupta Wholesale', '1500.00', 'credit', { is_customer: false, is_supplier: true });
const meena = await mk('Meena Stores', null, null);

const setDate = (id, d) => api('PATCH', `/parties/${id}`, { collection_date: d }, T);
let r = await setDate(ramesh.id, ist(0)); record('LED-05', 'collection date = today accepted', r.status === 200, r.status);
r = await setDate(anita.id, ist(3)); record('LED-05', 'collection date +3 accepted', r.status === 200, r.status);
await setDate(mohan.id, ist(6));
await setDate(kavita.id, ist(2));
r = await setDate(suresh.id, ist(-1)); record('LED-05', 'past date rejected 400', r.status === 400, JSON.stringify(r.body?.error?.details));
r = await setDate(suresh.id, ist(366)); record('LED-05', '366 days out rejected 400', r.status === 400, r.status);
r = await setDate(suresh.id, ist(365)); record('LED-05', '365 days out accepted', r.status === 200, r.status);
r = await setDate(gupta.id, ist(2)); record('LED-05', 'payable party → 409 collection_requires_receivable', r.status === 409 && r.body?.error?.code === 'collection_requires_receivable', `${r.status} ${r.body?.error?.code}`);
r = await setDate(meena.id, ist(2)); record('LED-05', 'zero-balance party → 409 collection_requires_receivable', r.status === 409 && r.body?.error?.code === 'collection_requires_receivable', `${r.status} ${r.body?.error?.code}`);
// overdue fixture: no API path can set a past date, so move it in the DB
psql(`update parties_party set collection_date = '${ist(-4)}' where id = '${suresh.id}'`);
// auto-clear when balance hits zero
await must('POST', `/parties/${kavita.id}/ledger-entries`, { direction: 'credit', amount: '600.00', entry_date: ist(0), payment_mode: 'cash', note: 'Paid in full' }, T);
const kv = await must('GET', `/parties/${kavita.id}`, null, T);
record('LED-05', 'collection date auto-clears when balance hits 0', kv.balance === '0.00' && kv.collection_date == null, `balance=${kv.balance} collection_date=${kv.collection_date}`);
const counts = {};
for (const b of ['today', 'overdue', 'upcoming']) counts[b] = (await must('GET', `/reminders/due?bucket=${b}`, null, T)) && (await api('GET', `/reminders/due?bucket=${b}`, null, T)).body.meta.total;
record('LED-05', 'buckets today=1 overdue=1 upcoming=2 (Kavita cleared)', counts.today === 1 && counts.overdue === 1 && counts.upcoming === 2, JSON.stringify(counts));
const preview = await must('POST', '/reminders/preview', { party_id: ramesh.id }, T);
record('LED-06', 'server preview text present', Boolean(preview.text), JSON.stringify(preview.text));

// members
const mkMember = async (role, name) => {
  const email = `w1-${role}-${uniq()}@e2e.test`;
  const made = await must('POST', '/members', { full_name: name, email, role }, T);
  let tk = (await must('POST', '/auth/login', { email, password: made.password })).access_token;
  await must('POST', '/auth/password/set', { current_password: made.password, new_password: PASSWORD }, tk);
  tk = (await must('POST', '/auth/login', { email, password: PASSWORD })).access_token;
  return { email, password: PASSWORD, token: tk };
};
const accountant = await mkMember('accountant', 'Priya Accountant');
const staff = await mkMember('staff', 'Raju Staff');
r = await api('POST', '/reminders', { party_id: ramesh.id, channel: 'whatsapp_manual' }, accountant.token);
record('LED-06', 'accountant POST /reminders → 403', r.status === 403, `${r.status} ${r.body?.error?.code}`);
r = await api('POST', '/reminders/preview', { party_id: ramesh.id }, accountant.token);
record('LED-06', 'accountant POST /reminders/preview → 403', r.status === 403, r.status);
r = await api('GET', '/reminders/due?bucket=today', null, accountant.token);
record('LED-05', 'accountant can read buckets', r.status === 200, r.status);
r = await api('PATCH', '/reminders/settings', { auto_sms: true }, accountant.token);
record('LED-07', 'accountant cannot change reminder settings', r.status === 403, r.status);

// notifications (the 9 AM scheduler, run by hand)
djangoShell(`from apps.platform_app.models import Tenant\nfrom apps.ledger.services.auto_reminders import schedule_for_tenant\nprint(schedule_for_tenant(tenant=Tenant.objects.get(pk='${owner.tenantId}')))`);
const unread0 = (await must('GET', '/notifications/unread-count', null, T)).count;
record('NTF-01', 'scheduler raises a reminder_due notification', unread0 >= 1, `unread=${unread0}`);

// expenses
const cats = await must('GET', '/expense-categories', null, T);
const cat = Object.fromEntries(cats.map((c) => [c.system_code, c]));
const E = (b) => must('POST', '/expenses', b, T);
await E({ amount: '12000', category_id: cat.rent.id, expense_date: ist(-2), mode: 'bank', note: 'September shop rent' });
await E({ amount: '8000', category_id: cat.salaries.id, expense_date: ist(-1), mode: 'bank', note: 'Helper salary — Raju' });
await E({ amount: '140', category_id: cat.food.id, expense_date: ist(0), mode: 'cash', note: 'Chai and biscuits' });
await E({ amount: '650', category_id: cat.transport.id, expense_date: ist(0), mode: 'upi', upi_app: 'phonepe', note: 'Tempo for stock' });
await E({ amount: '1800', category_id: (cat.electricity ?? cat.utilities ?? cats[4]).id, expense_date: ist(-3), mode: 'upi', upi_app: 'gpay', note: 'MSEB bill' });
// money in today so the cashbook has both sides
await must('POST', `/parties/${ramesh.id}/ledger-entries`, { direction: 'credit', amount: '500.00', entry_date: ist(0), payment_mode: 'cash', note: 'Part payment' }, T);
await must('POST', `/parties/${ramesh.id}/ledger-entries`, { direction: 'debit', amount: '500.00', entry_date: ist(0), note: 'Goods on credit' }, T);

// staff scope on the cashbook
r = await api('GET', `/cashbook?date_from=${ist(-7)}&date_to=${ist(0)}`, null, staff.token);
const rs = await api('GET', `/cashbook?date_from=${ist(0)}&date_to=${ist(0)}`, null, staff.token);
record('EXP-03', 'staff: 7-day cashbook refused or clamped to today', r.status === 403 || (r.status === 200 && JSON.stringify(r.body).includes(ist(0)) && !JSON.stringify(r.body.data?.days ?? []).includes(ist(-1))), `range=${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
record('EXP-03', 'staff: today cashbook readable', rs.status === 200, rs.status);

console.log('SEED', owner.email, owner.tenantId);

// ───────────────────────── browser ─────────────────────────
const browser = await chromium.launch();
const signIn = async (page, email, password = PASSWORD) => {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
};
const newCtx = async (size, locale) => {
  const c = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  await c.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (route) => route.fulfill({ status: 200, body: 'intercepted' }));
  await c.addInitScript(() => {
    window.__opens = 0;
    const o = window.open;
    window.open = (...a) => { window.__opens += 1; return o.apply(window, a); };
  });
  if (locale) await c.addCookies([{ name: 'ub_locale', value: locale, url: FRONTEND }]);
  return c;
};
const go = async (page, path) => { await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {}); await page.waitForTimeout(1200); };
const step = async (id, name, fn) => { try { await fn(); } catch (e) { record(id, `${name} (threw)`, false, e.message.split('\n')[0]); } };

for (const size of SIZES) {
  const S = size.id;
  const ctx = await newCtx(size);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const apiReqs = [];
  page.on('request', (q) => { if (q.url().includes('/api/v1/')) apiReqs.push(`${q.method()} ${q.url().replace(/^.*\/api\/v1/, '')}`); });
  await signIn(page, owner.email);

  // ── Reminders screen
  await step('LED-05', `${S} reminders tabs`, async () => {
    await go(page, '/ledger/reminders');
    const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    record('LED-05', `${S}: four tabs with counts`, tabs.length === 4 && /Due today.*1/.test(tabs[0]) && tabs.some((t) => /Overdue.*1/.test(t)) && tabs.some((t) => /Upcoming.*2/.test(t)) && tabs.some((t) => /Sent/.test(t)), JSON.stringify(tabs));
    record('UI', `${S}: /ledger/reminders no horizontal overflow`, (await overflow(page)) <= 0, `${await overflow(page)}px`);
    await shot(page, S, '01-reminders-due-today');
    await page.getByRole('tab', { name: /Overdue/ }).click(); await page.waitForTimeout(900);
    const body = await page.locator('[data-testid="reminders-screen"]').innerText();
    record('LED-05', `${S}: Overdue lists Suresh Kumar with "Overdue 4 days"`, /Suresh Kumar/.test(body) && /Overdue 4 days/.test(body), body.replace(/\n/g, ' | ').slice(0, 200));
    record('UI', `${S}: overdue row date dd/mm/yyyy`, /\d\d\/\d\d\/\d{4}/.test(body) || S === 'phone', S === 'phone' ? 'phone card shows relative "Overdue 4 days" only' : '');
    await shot(page, S, '02-reminders-overdue');
    await page.getByRole('tab', { name: /Upcoming/ }).click(); await page.waitForTimeout(900);
    const up = await page.locator('[data-testid="reminders-screen"]').innerText();
    record('LED-05', `${S}: Upcoming has Anita + Mohan (no mobile), not Kavita`, /Anita Devi/.test(up) && /Mohan Lal/.test(up) && !/Kavita/.test(up), up.replace(/\n/g, ' | ').slice(0, 200));
    await shot(page, S, '03-reminders-upcoming');
    const hdr = page.getByRole('button', { name: 'Reminder settings' });
    const hb = await hdr.boundingBox();
    record('UI', `${S}: settings action is icon-only ~32px`, hb && hb.width <= 40 && hb.height <= 40, JSON.stringify(hb));
  });

  // ── Manual reminder sheet from the reminders screen
  await step('LED-06', `${S} reminders sheet`, async () => {
    await page.getByRole('tab', { name: /Due today/ }).click(); await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Remind Ramesh Traders' }).first().click();
    const sheet = page.getByRole('dialog').last();
    await sheet.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
    const s = await sheet.evaluate((el) => ({
      preview: el.querySelector('[data-ub-share-preview]')?.textContent,
      links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      text: el.innerText,
    }));
    record('LED-06', `${S}: sheet shows the SERVER preview text`, s.preview === preview.text, JSON.stringify(s.preview));
    const wa = s.links.find((h) => h?.startsWith('https://wa.me'));
    record('LED-06', `${S}: WhatsApp link carries the server text`, Boolean(wa) && new URL(wa).searchParams.get('text') === preview.text, wa?.slice(0, 80));
    record('LED-06', `${S}: SMS link present`, s.links.some((h) => h?.startsWith('sms:+91')), JSON.stringify(s.links));
    record('LED-06', `${S}: Call link present`, s.links.some((h) => h?.startsWith('tel:')), '');
    await shot(page, S, '04-reminder-sheet');
    if (S === 'phone') {
      apiReqs.length = 0;
      const pop = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
      await sheet.getByRole('link', { name: 'WhatsApp' }).click();
      const p = await pop; if (p) await p.close();
      await page.waitForTimeout(2000);
      record('LED-06', 'WhatsApp tap records the reminder (POST /reminders + send)', apiReqs.some((x) => x.startsWith('POST /reminders')), apiReqs.join(' ; '));
      const hist = (await api('GET', `/reminders?party_id=${ramesh.id}`, null, T)).body;
      record('LED-06', 'reminder logged as sent via whatsapp_manual', hist.meta?.totals?.sent >= 1 && hist.meta?.totals?.last_channel === 'whatsapp_manual', JSON.stringify(hist.meta?.totals));
      // second reminder inside 24h → warning
      await go(page, '/ledger/reminders');
      await page.getByRole('button', { name: 'Remind Ramesh Traders' }).first().click();
      const s2 = page.getByRole('dialog').last();
      await s2.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      const t2 = await s2.innerText();
      record('LED-06', 'second reminder within 24h shows a warning', /You reminded this customer/.test(t2), t2.replace(/\n/g, ' | ').slice(0, 200));
      await shot(page, S, '05-reminder-sheet-24h-warning');
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.getByRole('tab', { name: /Sent/ }).click(); await page.waitForTimeout(1000);
      const sent = await page.locator('[data-testid="reminders-screen"]').innerText();
      record('LED-05', 'Sent tab lists the Ramesh reminder', /Ramesh Traders/.test(sent), sent.replace(/\n/g, ' | ').slice(0, 200));
    } else {
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.getByRole('tab', { name: /Sent/ }).click(); await page.waitForTimeout(1000);
    }
    await shot(page, S, '06-reminders-sent');
  });

  // ── Remind all (sequential)
  await step('LED-06', `${S} remind all`, async () => {
    await go(page, '/ledger/reminders');
    await page.getByRole('tab', { name: /Upcoming/ }).click(); await page.waitForTimeout(900);
    await page.evaluate(() => { window.__opens = 0; });
    await page.getByRole('button', { name: /Remind all on this page/ }).click();
    const dlg = page.getByRole('dialog').last();
    await dlg.waitFor({ timeout: 10000 }); await page.waitForTimeout(1500);
    const txt = await dlg.innerText();
    const opens = await page.evaluate(() => window.__opens);
    record('LED-06', `${S}: Remind all opens a stepper, zero window.open on open`, opens === 0 && /of \d+ done/.test(txt), `opens=${opens} ${txt.replace(/\n/g, ' | ').slice(0, 220)}`);
    record('LED-06', `${S}: Remind all lists the no-mobile party as left out`, /left out|no mobile/i.test(txt), '');
    await shot(page, S, '07-remind-all-dialog');
    const hasSkip = await dlg.getByRole('button', { name: 'Skip' }).count();
    const hasSend = await dlg.getByRole('link', { name: /^WhatsApp / }).count() + await dlg.getByRole('button', { name: /^WhatsApp / }).count();
    record('LED-06', `${S}: stepper has "WhatsApp {name}" + Skip`, hasSkip > 0 && hasSend > 0, `skip=${hasSkip} send=${hasSend}`);
    if (hasSkip) { await dlg.getByRole('button', { name: 'Skip' }).click(); await page.waitForTimeout(700); }
    const after = await dlg.innerText();
    record('LED-06', `${S}: Skip advances / finishes`, after !== txt, after.replace(/\n/g, ' | ').slice(0, 200));
    await shot(page, S, '08-remind-all-after-skip');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });

  // ── Settings dialog + banner
  await step('LED-07', `${S} settings`, async () => {
    await go(page, '/ledger/reminders');
    await page.getByRole('button', { name: 'Reminder settings' }).click();
    const dlg = page.getByRole('dialog').last();
    await dlg.waitFor(); await page.waitForTimeout(600);
    const sw = await dlg.getByRole('switch').count();
    const dt = await dlg.innerText();
    record('LED-07', `${S}: settings dialog has two switches + no-provider note`, sw === 2 && /No SMS provider is set up yet/.test(dt), `switches=${sw}`);
    await shot(page, S, '09-reminder-settings-dialog');
    if (S === 'phone') {
      await dlg.getByRole('switch').first().click(); await page.waitForTimeout(1200);
      await page.keyboard.press('Escape'); await page.waitForTimeout(800);
      const banner = await page.getByText("Automated SMS can't be sent yet").count();
      record('LED-07', 'auto SMS on + no provider → banner on the screen', banner > 0, `banner=${banner}`);
      const st = (await must('GET', '/reminders/settings', null, T));
      record('LED-07', 'switch persisted (auto_sms=true)', st.auto_sms === true, JSON.stringify(st));
    } else { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    await shot(page, S, '10-reminders-no-provider-banner');
  });

  // ── Khata: strip + sheet
  await step('LED-06', `${S} khata`, async () => {
    await go(page, `/parties/${ramesh.id}`);
    const body = await page.locator('main').innerText();
    const m = body.match(/Reminded [^\n]*/);
    record('LED-06', `${S}: khata strip "Reminded N times · last …"`, Boolean(m) && /Reminded (once|\d+ times) · last/.test(m[0]), m?.[0] ?? body.slice(0, 200));
    record('LED-05', `${S}: khata shows "Promised to pay on"`, /Promised to pay on/.test(body) || S === 'phone', S === 'phone' ? 'inside collapsed Details on phone' : '');
    record('UI', `${S}: khata no overflow`, (await overflow(page)) <= 0, `${await overflow(page)}px`);
    await shot(page, S, '11-khata-reminder-strip');
    await page.getByRole('button', { name: 'More actions' }).first().click();
    const menu = page.getByRole('dialog').last(); await menu.waitFor(); await page.waitForTimeout(300);
    const items = (await menu.locator('button').allInnerTexts()).map((x) => x.trim()).filter(Boolean);
    const remindLabel = items.find((x) => /remind/i.test(x));
    if (remindLabel) {
      await menu.getByRole('button', { name: remindLabel }).click();
      const sh = page.getByRole('dialog').last();
      await sh.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 }); await page.waitForTimeout(500);
      const pv = await sh.locator('[data-ub-share-preview]').textContent();
      record('LED-06', `${S}: khata sheet uses server text`, pv === preview.text, pv);
      await shot(page, S, '12-khata-reminder-sheet');
      await page.keyboard.press('Escape');
    } else record('LED-06', `${S}: khata ⋯ menu has a remind item`, false, JSON.stringify(items));
  });

  // ── Bell on every screen
  await step('NTF-01', `${S} bell`, async () => {
    for (const path of ['/parties', '/expenses', '/cashbook', '/ledger/reminders']) {
      await go(page, path);
      const bell = page.getByRole('button', { name: /notification/i }).first();
      const n = await bell.count();
      const label = n ? (await bell.getAttribute('aria-label')) ?? (await bell.innerText()) : null;
      record('NTF-01', `${S}: bell on ${path}`, n > 0, label);
    }
    await go(page, '/parties');
    const before = apiReqs.filter((x) => /^GET \/notifications(\?|$)/.test(x)).length;
    const bell = page.getByRole('button', { name: /notification/i }).first();
    const lab = await bell.getAttribute('aria-label');
    record('NTF-01', `${S}: bell announces unread count`, /\d+ unread/.test((lab ?? '') + (await bell.innerText())) || S === 'desktop', lab);
    record('NTF-01', `${S}: panel list not fetched before open (lazy)`, before === 0, `list fetches before open=${before}`);
    await bell.click(); await page.waitForTimeout(1500);
    const panel = page.getByRole('dialog').last();
    const pt = await panel.innerText().catch(() => '');
    record('NTF-01', `${S}: panel shows reminder_due row`, /payment due today/.test(pt), pt.replace(/\n/g, ' | ').slice(0, 200));
    await shot(page, S, '13-notification-panel');
    if (S === 'phone') {
      const mar = panel.getByRole('button', { name: 'Mark all as read' });
      if (await mar.count()) { await mar.click(); await page.waitForTimeout(1200); }
      const c = (await must('GET', '/notifications/unread-count', null, T)).count;
      record('NTF-01', 'Mark all as read → unread 0', c === 0, `unread=${c}`);
      await shot(page, S, '14-notification-panel-read');
    }
    await page.keyboard.press('Escape');
  });

  // ── Expenses
  await step('EXP-01', `${S} expenses list`, async () => {
    await go(page, '/expenses');
    await page.getByRole('button', { name: /This month/ }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const body = await page.locator('main').innerText();
    record('EXP-01', `${S}: list shows totals + top categories`, /Total/.test(body) && /Top:/.test(body), body.replace(/\n/g, ' | ').slice(0, 250));
    record('UI', `${S}: /expenses no overflow`, (await overflow(page)) <= 0, `${await overflow(page)}px`);
    record('UI', `${S}: expense rows dd/mm/yyyy`, /\d\d\/\d\d\/\d{4}/.test(body), '');
    record('UI', `${S}: no "coming soon" copy`, !/coming soon|not built|later release/i.test(body), '');
    await shot(page, S, '15-expenses-list');
    const search = page.getByRole('searchbox').or(page.getByPlaceholder('Number, note or party')).first();
    await search.fill('Chai'); await page.waitForTimeout(1500);
    const sb = await page.locator('main').innerText();
    record('EXP-01', `${S}: search "Chai" narrows the list`, /Chai and biscuits/.test(sb) && !/MSEB bill/.test(sb), '');
    await search.fill(''); await page.waitForTimeout(800);
  });

  await step('EXP-02', `${S} add expense drawer`, async () => {
    await go(page, '/expenses');
    await page.getByRole('button', { name: /^Add expense$/ }).first().click();
    const dr = page.getByRole('dialog').last(); await dr.waitFor(); await page.waitForTimeout(800);
    await shot(page, S, '16-add-expense-drawer');
    const amount = dr.getByLabel('Amount');
    const ab = await amount.boundingBox();
    record('UI', `${S}: amount input 40px with placeholder`, ab && Math.round(ab.height) === 40 && (await amount.getAttribute('placeholder')), `${ab?.height} ${await amount.getAttribute('placeholder')}`);
    const dateText = await dr.innerText();
    record('UI', `${S}: date control reads like "24 Sep 2026"`, /\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/.test(dateText) || /\d{1,2} [A-Z][a-z]{2} \d{4}/.test(await dr.locator('input, button').evaluateAll((els) => els.map((e) => e.value || e.textContent).join(' '))), '');
    if (S === 'phone') {
      await amount.fill('3500');
      // category: new category inline
      await dr.getByRole('combobox', { name: /Category/ }).or(dr.getByLabel('Category')).first().click();
      await page.waitForTimeout(500);
      const newCat = page.getByRole('button', { name: /New category/ }).or(page.getByText('New category')).first();
      if (await newCat.count()) {
        await newCat.click(); await page.waitForTimeout(400);
        await page.getByLabel('New category name').fill('Hamali');
        await page.getByRole('button', { name: /^Add$/ }).last().click(); await page.waitForTimeout(1200);
        record('EXP-02', 'new category inline created', (await must('GET', '/expense-categories', null, T)).some((c) => c.name === 'Hamali'), '');
      } else record('EXP-02', 'new category inline control present', false, '');
      await shot(page, S, '17-add-expense-new-category');
      const paid = dr.getByRole('switch', { name: /Paid now/ });
      await paid.click(); await page.waitForTimeout(500);
      await dr.getByPlaceholder('Search a customer or supplier').fill('Gupta'); await page.waitForTimeout(1500);
      await page.getByRole('option', { name: /Gupta Wholesale/ }).first().click().catch(async () => page.getByText('Gupta Wholesale').last().click());
      await page.waitForTimeout(500);
      await dr.getByPlaceholder('e.g. Tea and snacks for staff').fill('Loading charges — unpaid').catch(() => {});
      await dr.getByRole('button', { name: /Pick a date/ }).or(dr.getByText('Pick a date')).first().click();
      await page.waitForTimeout(700);
      const cal = page.locator('[role="grid"]').last();
      const days = await cal.locator('button:not([disabled])').allInnerTexts().catch(() => []);
      console.log('calendar days', JSON.stringify(days).slice(0, 200));
      await cal.locator('button:not([disabled])').filter({ hasText: /^30$/ }).last().click().catch(async () => cal.locator('button:not([disabled])').last().click());
      await page.waitForTimeout(600);
      await shot(page, S, '18-add-expense-unpaid-party');
      const saveResp = page.waitForResponse((q) => q.url().includes('/api/v1/expenses') && q.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
      await dr.getByRole('button', { name: /^Save$/ }).click();
      const resp = await saveResp;
      const status = resp?.status();
      let bodyErr = ''; if (status !== 201) bodyErr = (await dr.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 300);
      record('EXP-02', 'unpaid expense with party saved (201)', status === 201, `${status} ${bodyErr}`);
      await page.waitForTimeout(1000);
      const g = await must('GET', `/parties/${gupta.id}`, null, T);
      record('EXP-02', 'Gupta balance moved by -3500 (payable 5000)', g.balance === '-5000.00', g.balance);
    } else await page.keyboard.press('Escape');
  });

  if (S === 'phone') await step('EXP-02', 'khata owed entry + void', async () => {
    await go(page, `/parties/${gupta.id}`);
    const body = await page.locator('main').innerText();
    record('EXP-02', 'Gupta khata shows "Owed for an expense"', /Owed for an expense/.test(body), body.replace(/\n/g, ' | ').slice(0, 250));
    await shot(page, S, '19-khata-owed-for-expense');
    await go(page, '/expenses');
    await page.getByRole('tab', { name: /Unpaid/ }).click(); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Open .*(Hamali|Loading|EXP)/ }).first().click().catch(async () => page.getByText(/Loading charges|Hamali/).first().click());
    const sh = page.getByRole('dialog').last(); await sh.waitFor(); await page.waitForTimeout(800);
    const st = await sh.innerText();
    record('EXP-02', 'detail sheet shows khata note', /in Gupta Wholesale's khata as money you owe/.test(st), st.replace(/\n/g, ' | ').slice(0, 200));
    await shot(page, S, '20-expense-detail-sheet');
    await sh.getByRole('button', { name: /^Void$/ }).click(); await page.waitForTimeout(600);
    const vd = page.getByRole('dialog').last();
    await shot(page, S, '21-expense-void-dialog');
    await vd.getByRole('button', { name: 'Void expense' }).click(); await page.waitForTimeout(600);
    const needReason = /Give a short reason/.test(await vd.innerText());
    record('EXP-02', 'void without reason blocked', needReason, '');
    await vd.getByPlaceholder('e.g. Wrong amount').fill('Hamali was already paid in cash');
    await vd.getByRole('button', { name: 'Void expense' }).click(); await page.waitForTimeout(1800);
    const g = await must('GET', `/parties/${gupta.id}`, null, T);
    record('EXP-02', 'void reverses the khata (Gupta back to -1500)', g.balance === '-1500.00', g.balance);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Void/ }).click(); await page.waitForTimeout(1200);
    await shot(page, S, '22-expenses-void-tab');
  });

  // ── Cashbook
  await step('EXP-03', `${S} cashbook`, async () => {
    await go(page, '/cashbook?period=today');
    const body = await page.locator('main').innerText();
    record('EXP-03', `${S}: tiles + where money went + close the day`, /Opening/.test(body) && /Money in/.test(body) && /Money out/.test(body) && /Where the money went/.test(body) && /Close the day/.test(body), body.replace(/\n/g, ' | ').slice(0, 260));
    record('UI', `${S}: /cashbook no overflow`, (await overflow(page)) <= 0, `${await overflow(page)}px`);
    await shot(page, S, '23-cashbook');
    const m = body.match(/Expected cash in drawer: (-?)₹([\d,\.]+)/);
    const exp = m ? Number(m[1] + m[2].replace(/,/g, '')) : null;
    const cc = page.getByLabel('Counted cash');
    const verdicts = [];
    for (const v of exp != null ? [exp - 100, exp + 50, exp] : [1000]) {
      await cc.fill(String(v)); await page.waitForTimeout(500);
      const t = await page.locator('main').innerText();
      verdicts.push((t.match(/Short by ₹[\d,.]+|Extra ₹[\d,.]+|Matches/) ?? ['?'])[0]);
      if (v === (exp ?? 0) - 100) await shot(page, S, '24-cashbook-close-day-short');
    }
    record('EXP-03', `${S}: counted cash → Short/Extra/Matches`, exp != null && /Short by ₹100/.test(verdicts[0]) && /Extra ₹50/.test(verdicts[1]) && verdicts[2] === 'Matches', `expected=${exp} ${JSON.stringify(verdicts)}`);
    await shot(page, S, '25-cashbook-close-day-matches');
  });

  record('UI', `${S}: no page errors`, errors.length === 0, errors.join(' ; ').slice(0, 300));
  await ctx.close();
}

// ── Hindi captures
for (const size of SIZES) {
  const ctx = await newCtx(size, 'hi');
  const page = await ctx.newPage();
  await signIn(page, owner.email);
  await go(page, '/ledger/reminders');
  await page.getByRole('tab').nth(1).click().catch(() => {}); await page.waitForTimeout(800);
  await shot(page, size.id, '30-reminders-hindi');
  await go(page, '/expenses');
  await shot(page, size.id, '31-expenses-hindi');
  const t = await page.locator('main').innerText();
  record('i18n', `${size.id}: Hindi /expenses has no raw keys`, !/expenses\.[a-z]/.test(t), '');
  await ctx.close();
}

// ── Accountant + staff
{
  const ctx = await newCtx(SIZES[1]);
  const page = await ctx.newPage();
  await signIn(page, accountant.email);
  await go(page, '/ledger/reminders');
  const remind = await page.getByRole('button', { name: /^Remind / }).count();
  const all = await page.getByRole('button', { name: /Remind all/ }).count();
  const settings = await page.getByRole('button', { name: 'Reminder settings' }).count();
  record('LED-06', 'accountant: no Remind / Remind all / settings on reminders screen', remind === 0 && all === 0 && settings === 0, `remind=${remind} all=${all} settings=${settings}`);
  await shot(page, 'desktop', '40-reminders-accountant');
  await go(page, `/parties/${ramesh.id}`);
  const more = page.getByRole('button', { name: 'More actions' }).first();
  let items = [];
  if (await more.count()) { await more.click(); await page.waitForTimeout(500); items = (await page.getByRole('dialog').last().locator('button').allInnerTexts()).map((x) => x.trim()); }
  record('LED-06', 'accountant: khata ⋯ has no reminder item', !items.some((x) => /remind/i.test(x)), JSON.stringify(items));
  await ctx.close();
}
for (const size of SIZES) {
  const ctx = await newCtx(size);
  const page = await ctx.newPage();
  await signIn(page, staff.email);
  await go(page, '/cashbook');
  const t = await page.locator('main').innerText();
  record('EXP-03', `${size.id}: staff sees "today's cash only" scope note`, /You can see today's cash only/.test(t), t.replace(/\n/g, ' | ').slice(0, 200));
  await shot(page, size.id, '41-cashbook-staff-today-only');
  await ctx.close();
}

await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`FAIL [${f.id}] ${f.check} — ${f.detail}`);
process.exit(failed.length ? 1 : 0);
