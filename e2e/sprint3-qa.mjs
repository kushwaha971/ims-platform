/**
 * sprint3-qa.mjs — independent QA of three Sprint 3 deliveries, against a LIVE
 * stack, through the browser AND the API:
 *
 *   A. LED-06 "Send reminder" and UbShareSheet (79ae51d)
 *   B. PTY-02 §9 — the party list's states (79ae51d)
 *   C. PLT-05 — an invitation reserves a seat and grants nothing (28a7975)
 *
 * It asserts the NETWORK and the SCREEN, not the controls (CLAUDE.md). Width is
 * MEASURED (scrollWidth vs innerWidth), never read.
 *
 * `register_ip` is a DB budget of ~20 per hour, so this registers exactly TWO
 * accounts (an owner and an invitee who already has an account) and keeps them
 * in STATE_FILE; a rerun reuses them. The accountant is created by the owner
 * through POST /members (DEC-012), which is not a registration.
 *
 *   node e2e/sprint3-qa.mjs                 # all phases
 *   node e2e/sprint3-qa.mjs --only=A,B      # a subset (C is not re-runnable
 *                                           # against the same accounts)
 *   node e2e/sprint3-qa.mjs --fresh         # new accounts (2 registrations)
 *
 * Fixtures that the API cannot create are written with psql and SAID SO in
 * the output: an archived party that still has a balance (the archive guard
 * refuses it, so it can only exist as legacy data), a party mobile stored in
 * a spaced legacy spelling, the owner's tenant moved to the `free` plan for
 * the seat check, and a deny override of ledger.entry.read (no system role
 * lacks it and there is no API for overrides).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const BACKEND_DIR = '/home/claude/repo/backend';
const SHOT_ROOT = '/tmp/e2e-shots/sprint3-qa';
const STATE_FILE = `${SHOT_ROOT}/state.json`;
const BE_LOG = '/tmp/claude-0/be-run.log';

const argOnly = process.argv.find((a) => a.startsWith('--only='));
const PHASES = argOnly ? argOnly.slice(7).split(',') : ['A', 'B', 'C'];
const FRESH = process.argv.includes('--fresh');

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
  { id: '2k', width: 2560, height: 1440 },
];
const PHONE = SIZES[0];
const DESKTOP = SIZES[3];

const results = [];
const record = (id, check, ok, detail = '') => {
  results.push({ id, check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  [${id}] ${check}${detail ? `\n        ${String(detail).slice(0, 600)}` : ''}`);
};
const note = (text) => console.log(`      · ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── API, retrying across an API restart (other engineers are deploying) ─────
const api = async (method, path, body, token, extra = {}) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`${BACKEND}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Client': 'api',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extra,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { payload = text; }
      return { status: response.status, body: payload, headers: response.headers };
    } catch (error) {
      if (attempt >= 20) throw error;
      await sleep(3000);
    }
  }
};
const must = async (...args) => {
  const r = await api(...args);
  if (r.status >= 400) throw new Error(`${args[0]} ${args[1]} ${r.status}: ${JSON.stringify(r.body)}`);
  return r;
};
const psql = (sql) =>
  execFileSync('psql', ['-h', '127.0.0.1', '-U', 'udhaarbook', 'udhaarbook', '-tAq', '-c', sql], {
    env: { ...process.env, PGPASSWORD: 'udhaarbook' },
  }).toString().trim();
const djangoShell = (code) =>
  execFileSync('python3', ['manage.py', 'shell', '-c', code], { cwd: BACKEND_DIR }).toString().trim();

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const todayIst = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  return parts; // dd/mm/yyyy
};

const login = async (email, password) =>
  (await must('POST', '/auth/login', { email, password })).body.data.access_token;

// ── Seed (two registrations, reused on rerun) ────────────────────────────────
const PARTIES = [
  { key: 'ramesh', name: 'Ramesh Traders', mobile: '09812345678', ob: '2300.00', dir: 'debit' },
  { key: 'mahesh', name: 'Mahesh Suppliers', mobile: '9876543210', ob: '1500.00', dir: 'credit', supplier: true },
  { key: 'suresh', name: 'Suresh Settled Stores', mobile: '9823456789' },
  { key: 'dinesh', name: 'Dinesh Kirana', mobile: '9834567890', ob: '800.00', dir: 'debit' },
  { key: 'ganesh', name: 'Ganesh Provision', mobile: null, ob: '450.00', dir: 'debit' },
  { key: 'priya', name: 'Priya Textiles', mobile: '9812345679', ob: '1200.50', dir: 'debit' },
  { key: 'anil', name: 'Anil Hardware', mobile: '+919812345680', ob: '123456.78', dir: 'debit' },
  { key: 'kavita', name: 'Kavita Dairy', mobile: '9856789012', ob: '300.00', dir: 'debit' },
  { key: 'lakshmi', name: 'Lakshmi Bakers', mobile: '9867890123' },
  { key: 'om', name: 'Om Sai Electricals', mobile: '9878901234', ob: '750.00', dir: 'credit', supplier: true },
  { key: 'vijay', name: 'Vijay Medical', mobile: '9889012345', ob: '60.00', dir: 'debit' },
  { key: 'sunita', name: 'Sunita Tailors', mobile: '9890123456' },
];

const saveState = (state) => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

/** Step-wise and resumable: every step persists, so a failure never costs a second registration. */
async function seed() {
  let state;
  if (!FRESH && existsSync(STATE_FILE)) {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    note(`reusing accounts from ${STATE_FILE}`);
  } else {
    const stamp = Date.now();
    state = {
      stamp,
      owner: { email: `qa-owner-${stamp}@sharmakirana.test`, password: 'Dukaan2026x', name: 'Suresh Sharma' },
      invitee: { email: `qa-invitee-${stamp}@guptastore.test`, password: 'Dukaan2026y', name: 'Rahul Gupta' },
      accountant: { email: `qa-acct-${stamp}@sharmakirana.test`, password: 'Hisaab2026z', name: 'Neha Joshi' },
      shop: 'Sharma Kirana Store',
      inviteeShop: 'Gupta General Store',
      parties: {},
      steps: {},
    };
    saveState(state);
  }
  state.steps ??= {};
  const step = async (name, fn) => {
    if (state.steps[name]) return;
    await fn();
    state.steps[name] = true;
    saveState(state);
  };
  // 1 — the owner and their business (registration #1)
  await step('owner', async () => {
    const reg = await must('POST', '/auth/register', { email: state.owner.email, password: state.owner.password, full_name: state.owner.name });
    await must('POST', '/tenants', { name: state.shop, business_type: 'retail', state_code: '27' },
      reg.body.data.access_token, { 'Idempotency-Key': `t-${state.stamp}` });
  });
  const token = await login(state.owner.email, state.owner.password);
  state.tenantId = psql(`select m.tenant_id from platform_membership m join platform_user u on u.id=m.user_id where u.email='${state.owner.email}'`);
  await step('parties', async () => {
    for (const [i, p] of PARTIES.entries()) {
      if (state.parties[p.key]) continue;
      const made = await must('POST', '/parties', {
        name: p.name,
        is_customer: !p.supplier,
        is_supplier: Boolean(p.supplier),
        mobile: p.mobile,
        ...(p.ob ? { opening_balance_amount: p.ob, opening_balance_direction: p.dir, opening_balance_as_of: daysAgo(30) } : {}),
      }, token, { 'Idempotency-Key': `p-${state.stamp}-${i}` });
      state.parties[p.key] = made.body.data.id;
      saveState(state);
    }
  });
  // Fixtures the API refuses to create (see header)
  await step('fixtures', async () => {
    psql(`update parties_party set status='archived' where id='${state.parties.dinesh}'`);
    psql(`update parties_party set mobile='+91 98123 45679' where id='${state.parties.priya}'`);
    note('FIXTURE (psql): Dinesh Kirana archived with ₹800 still owed; Priya Textiles mobile stored as "+91 98123 45679"');
  });
  // 2 — the accountant, created by the owner (not a registration)
  await step('accountant', async () => {
    const acct = await must('POST', '/members', { full_name: state.accountant.name, email: state.accountant.email, role: 'accountant', mobile: '9845678901' },
      token, { 'Idempotency-Key': `m-${state.stamp}` });
    const tmp = acct.body.data.password;
    const acctToken = await login(state.accountant.email, tmp);
    await must('POST', '/auth/password/set', { current_password: tmp, new_password: state.accountant.password }, acctToken);
  });
  // 3 — the invitee: an account that already exists, with its own empty business (registration #2)
  await step('invitee', async () => {
    const reg2 = await must('POST', '/auth/register', { email: state.invitee.email, password: state.invitee.password, full_name: state.invitee.name });
    await must('POST', '/tenants', { name: state.inviteeShop, business_type: 'retail', state_code: '09' },
      reg2.body.data.access_token, { 'Idempotency-Key': `t2-${state.stamp}` });
  });
  state.inviteeTenantId = psql(`select m.tenant_id from platform_membership m join platform_user u on u.id=m.user_id join platform_tenant t on t.id=m.tenant_id where u.email='${state.invitee.email}' and t.name='${state.inviteeShop}'`);
  saveState(state);
  return state;
}

// ── Browser helpers ─────────────────────────────────────────────────────────
const signIn = async (page, who) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(1500);
      await page.fill('input[type="email"]', who.email);
      await page.fill('input[type="password"]', who.password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
      await page.waitForTimeout(1500);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(3000);
    }
  }
};
/** WHO is signed in, from the server — asserted before any role check (CLAUDE.md). */
const whoAmI = async (page) =>
  page.evaluate(async (backend) => {
    const r = await fetch(`${backend}/auth/me`, { credentials: 'include' });
    const j = await r.json().catch(() => null);
    return { status: r.status, email: j?.data?.user?.email ?? null, data: j?.data ?? null };
  }, BACKEND);
const overflowPx = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shotPath = (size, name) => `${SHOT_ROOT}/${size}/${name}.png`;


// ═════════════════════════════════════════════════════════════════════════════
// A — Send reminder / UbShareSheet
// ═════════════════════════════════════════════════════════════════════════════
const EN_TEMPLATE = (party, amount, shop, date) =>
  `Namaste ${party},\nRs ${amount} is pending with ${shop} as of ${date}.\nKindly pay at your convenience. Thank you.\n— ${shop}`;
const HI_TEMPLATE = (party, amount, shop, date) =>
  `नमस्ते ${party},\n${date} तक ${shop} का Rs ${amount} बकाया है।\nकृपया सुविधानुसार भुगतान करें। धन्यवाद।\n— ${shop}`;

const openKhata = async (page, partyId, name) => {
  await page.goto(`${FRONTEND}/parties/${partyId}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
};
/** The ⋯ sheet's item labels, or null when there is no ⋯ at all. */
const menuItems = async (page) => {
  const more = page.getByRole('button', { name: /^(More actions|और विकल्प)$/ }).first();
  if ((await more.count()) === 0) return null;
  await more.click();
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  const labels = await dialog.locator('button').allInnerTexts();
  return labels.map((l) => l.trim()).filter(Boolean);
};
const closeTopDialog = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
};
const openReminder = async (page, label = 'Send reminder') => {
  const items = await menuItems(page);
  if (!items?.includes(label)) throw new Error(`no "${label}" in menu: ${JSON.stringify(items)}`);
  await page.getByRole('dialog').last().getByRole('button', { name: label }).click();
  const sheet = page.getByRole('dialog').last();
  await sheet.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  return sheet;
};
const readSheet = async (sheet) =>
  sheet.evaluate((el) => {
    const links = [...el.querySelectorAll('a')];
    const wa = links.find((a) => a.href.startsWith('https://wa.me'));
    const sms = links.find((a) => a.href.startsWith('sms:'));
    return {
      title: el.querySelector('h2')?.textContent ?? null,
      description: el.querySelector('[id$="-description"]')?.textContent ?? null,
      preview: el.querySelector('[data-ub-share-preview]')?.textContent ?? null,
      waHref: wa?.getAttribute('href') ?? null,
      waTarget: wa?.getAttribute('target') ?? null,
      waRel: wa?.getAttribute('rel') ?? null,
      smsHref: sms?.getAttribute('href') ?? null,
      text: el.innerText,
    };
  });

async function phaseA(browser, state) {
  const P = state.parties;
  const shop = state.shop;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND });
  // wa.me is never actually fetched: the popup is intercepted so the check can
  // read the URL WhatsApp would have been opened with.
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (route) => route.fulfill({ status: 200, body: 'intercepted' }));
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  await signIn(page, state.owner);
  const me = await whoAmI(page);
  record('A', 'signed in as the OWNER before any owner check', me.email === state.owner.email, me.email);

  // ── A1 visibility ──────────────────────────────────────────────────────────
  const cases = [
    ['ramesh', /Ramesh Traders/, true, 'receivable ₹2,300 (owes me)'],
    ['mahesh', /Mahesh Suppliers/, false, 'payable ₹1,500 (I owe)'],
    ['suresh', /Suresh Settled Stores/, false, 'zero balance'],
    ['dinesh', /Dinesh Kirana/, false, 'archived, still owes ₹800 (psql fixture)'],
  ];
  for (const [key, name, expected, why] of cases) {
    await openKhata(page, P[key], name);
    const items = await menuItems(page);
    const has = Boolean(items?.includes('Send reminder'));
    record('A1', `owner: "Send reminder" ${expected ? 'shown' : 'hidden'} — ${why}`, has === expected, `menu=${JSON.stringify(items)}`);
    if (items) await closeTopDialog(page);
  }

  // ── A2/A3/A4 the sheet for Ramesh (mobile stored as 09812345678) ───────────
  await openKhata(page, P.ramesh, /Ramesh Traders/);
  const apiRequests = [];
  const onRequest = (r) => {
    const u = r.url();
    if (u.startsWith(BACKEND) || u.includes('/api/v1/')) apiRequests.push(`${r.method()} ${u}`);
  };
  const more = page.getByRole('button', { name: 'More actions' }).first();
  let sheet = await openReminder(page);
  const today = todayIst();
  let s = await readSheet(sheet);
  const expected = EN_TEMPLATE('Ramesh Traders', '2,300.00', shop, today);
  record('A2', 'dialog title is "Send reminder"', s.title === 'Send reminder', s.title);
  record('A2', 'recipient line "To {name} · {mobile}"', s.description === 'To Ramesh Traders · 09812345678', s.description);
  record('A2', `preview is exactly the template, dated TODAY in the shop's timezone (IST ${today}; browser clock is UTC)`, s.preview === expected,
    JSON.stringify(s.preview));
  const wa = s.waHref ? new URL(s.waHref) : null;
  record('A3', 'WhatsApp href is https://wa.me/919812345678?text=… (09812345678 normalised)',
    Boolean(wa) && wa.origin === 'https://wa.me' && wa.pathname === '/919812345678' && [...wa.searchParams.keys()].join() === 'text', s.waHref);
  record('A3', 'WhatsApp text decodes to exactly the preview', wa?.searchParams.get('text') === expected);
  record('A3', 'WhatsApp link opens a new tab with rel noopener', s.waTarget === '_blank' && /\bnoopener\b/.test(s.waRel ?? ''), `${s.waTarget} ${s.waRel}`);
  const smsOk = s.smsHref?.startsWith('sms:+919812345678?&body=') && decodeURIComponent(s.smsHref.split('?&body=')[1] ?? '') === expected;
  record('A4', 'SMS href is sms:+919812345678?&body=<the same text>', Boolean(smsOk), s.smsHref?.slice(0, 80));
  record('A7', 'nothing in the sheet says "sent"', !/\bsent\b/i.test(s.text), s.text.replace(/\n/g, ' | '));

  // ── A9 keyboard: focus inside, Escape closes, focus back on ⋯ ─────────────
  const focusInside = await sheet.evaluate((el) => el.contains(document.activeElement));
  record('A9', 'focus starts inside the sheet', focusInside,
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.slice(0, 40)));
  // Tab cycles within (focus trap)
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
  record('A9', 'Tab ×6 keeps focus inside the sheet (trap)', await sheet.evaluate((el) => el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const sheetsLeft = await page.getByRole('dialog').count();
  const focusInfo = await page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label') ?? null,
    tag: document.activeElement?.tagName,
    text: document.activeElement?.textContent?.trim().slice(0, 30),
  }));
  record('A9', 'Escape closes the sheet', sheetsLeft === 0, `dialogs=${sheetsLeft}`);
  record('A9', 'focus returns to the ⋯ (More actions) button', focusInfo.label === 'More actions', JSON.stringify(focusInfo));

  // ── A7 opening a channel makes no API request, and never says sent ────────
  page.on('request', onRequest);
  sheet = await openReminder(page);
  apiRequests.length = 0;
  const popupPromise = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await sheet.getByRole('link', { name: 'WhatsApp' }).click();
  const popup = await popupPromise;
  await page.waitForTimeout(1500);
  const snackWa = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  record('A7', 'WhatsApp click opens a new tab at the wa.me URL', Boolean(popup) && (popup?.url() ?? '').startsWith('https://wa.me/919812345678?text='), popup?.url()?.slice(0, 60));
  record('A7', 'WhatsApp click makes no request to the API', apiRequests.length === 0, apiRequests.join(' ; '));
  record('A7', 'feedback says "WhatsApp opened", never "sent"',
    snackWa.some((t) => t.includes('WhatsApp opened')) && !snackWa.some((t) => /\bsent\b/i.test(t)), JSON.stringify(snackWa));
  record('A7', 'the sheet closes after WhatsApp', (await page.getByRole('dialog').count()) === 0);
  if (popup) await popup.close();

  sheet = await openReminder(page);
  apiRequests.length = 0;
  await sheet.getByRole('link', { name: 'SMS' }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const snackSms = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  record('A7', 'SMS click makes no request to the API', apiRequests.length === 0, apiRequests.join(' ; '));
  record('A7', 'SMS feedback never says "sent"', !snackSms.some((t) => /\bsent\b/i.test(t)), JSON.stringify(snackSms));

  // ── A8 Copy text ──────────────────────────────────────────────────────────
  await page.waitForTimeout(4000);
  sheet = await openReminder(page);
  apiRequests.length = 0;
  await sheet.getByRole('button', { name: 'Copy text' }).click();
  await page.getByText('Message copied').first().waitFor({ timeout: 5000 }).catch(() => {});
  const copiedSnack = await page.getByText('Message copied').count();
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e}`);
  record('A8', 'Copy → snackbar "Message copied"', copiedSnack > 0);
  record('A8', 'Copy → the clipboard holds exactly the message', clip === expected, JSON.stringify(clip).slice(0, 120));
  record('A8', 'Copy closes the sheet', (await page.getByRole('dialog').count()) === 0);
  record('A8', 'Copy makes no request to the API', apiRequests.length === 0, apiRequests.join(' ; '));
  page.off('request', onRequest);

  // ── A5/A6 other numbers and amounts ───────────────────────────────────────
  const numberCases = [
    ['ganesh', /Ganesh Provision/, null, '450.00', 'no mobile'],
    ['priya', /Priya Textiles/, '919812345679', '1,200.50', 'mobile stored "+91 98123 45679" (psql fixture)'],
    ['anil', /Anil Hardware/, '919812345680', '1,23,456.78', 'mobile stored "+919812345680", Indian grouping'],
  ];
  for (const [key, name, digits, amount, why] of numberCases) {
    await openKhata(page, P[key], name);
    sheet = await openReminder(page);
    s = await readSheet(sheet);
    const partyName = name.source.replace(/\\/g, '');
    const exp = EN_TEMPLATE(partyName, amount, shop, todayIst());
    if (digits === null) {
      record('A5', 'no mobile → WhatsApp href is https://wa.me/?text=…', s.waHref?.startsWith('https://wa.me/?text=') && new URL(s.waHref).searchParams.get('text') === exp, s.waHref?.slice(0, 40));
      record('A5', 'no mobile → SMS href is sms:?&body=…', Boolean(s.smsHref?.startsWith('sms:?&body=')), s.smsHref?.slice(0, 30));
      record('A5', 'no mobile → recipient line says WhatsApp will ask for the chat', /^To Ganesh Provision · no mobile saved/.test(s.description ?? ''), s.description);
    } else {
      const u = new URL(s.waHref);
      record('A6', `${why} → wa.me/${digits}`, u.pathname === `/${digits}`, s.waHref.slice(0, 40));
      record('A6', `${why} → sms:+${digits}`, s.smsHref?.startsWith(`sms:+${digits}?&body=`), s.smsHref?.slice(0, 30));
      record('A6', `${why} → amount "${amount}" in the text`, s.preview === exp, JSON.stringify(s.preview));
      record('A6', `${why} → recipient line`, (s.description ?? '').startsWith(`To ${partyName} · `), s.description);
    }
    await closeTopDialog(page);
  }

  // ── A10 Hindi ─────────────────────────────────────────────────────────────
  await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FRONTEND }]);
  await openKhata(page, P.ramesh, /Ramesh Traders/);
  const hiItems = await menuItems(page);
  record('A10', 'Hindi: the menu item reads "रिमाइंडर भेजें"', Boolean(hiItems?.includes('रिमाइंडर भेजें')), JSON.stringify(hiItems));
  if (hiItems?.includes('रिमाइंडर भेजें')) {
    await page.getByRole('dialog').last().getByRole('button', { name: 'रिमाइंडर भेजें' }).click();
    sheet = page.getByRole('dialog').last();
    await sheet.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);
    s = await readSheet(sheet);
    const hiExp = HI_TEMPLATE('Ramesh Traders', '2,300.00', shop, todayIst());
    record('A10', 'Hindi: title "रिमाइंडर भेजें"', s.title === 'रिमाइंडर भेजें', s.title);
    record('A10', 'Hindi: recipient line', s.description === 'Ramesh Traders · 09812345678 को', s.description);
    record('A10', 'Hindi: preview is the Hindi template', s.preview === hiExp, JSON.stringify(s.preview));
    record('A10', 'Hindi: WhatsApp text is the Hindi message', new URL(s.waHref).searchParams.get('text') === hiExp);
    await page.screenshot({ path: shotPath('desktop', 'A-sheet-hindi') });
    await closeTopDialog(page);
  }
  await ctx.clearCookies({ name: 'ub_locale' });
  record('A', 'no console errors on the owner khata/sheet pages', consoleErrors.filter((t) => !/401|Unauthorized/.test(t)).length === 0, consoleErrors.join(' ; ').slice(0, 400));
  await ctx.close();

  // ── A1 accountant: visible by design ───────────────────────────────────────
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await c.newPage();
    await signIn(pg, state.accountant);
    const who = await whoAmI(pg);
    const perms = who.data?.permissions ?? [];
    record('A1', 'signed in as the ACCOUNTANT (ledger.entry.read, no ledger.entry.write)',
      who.email === state.accountant.email && perms.includes('ledger.entry.read') && !perms.includes('ledger.entry.write'), who.email);
    await openKhata(pg, P.ramesh, /Ramesh Traders/);
    const items = await menuItems(pg);
    record('A1', 'accountant: "Send reminder" shown on a receivable party (by design)', Boolean(items?.includes('Send reminder')), JSON.stringify(items));
    if (items?.includes('Send reminder')) {
      await pg.getByRole('dialog').last().getByRole('button', { name: 'Send reminder' }).click();
      const sh = pg.getByRole('dialog').last();
      await sh.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 });
      const ss = await readSheet(sh);
      record('A1', 'accountant: the sheet carries the same message', ss.preview === EN_TEMPLATE('Ramesh Traders', '2,300.00', shop, todayIst()));
    }
    await c.close();
  }

  // ── A1 a role without ledger.entry.read ────────────────────────────────────
  {
    const membership = psql(`select m.id||'|'||m.status||'|'||r.code from platform_membership m join platform_user u on u.id=m.user_id join platform_role r on r.id=m.role_id where u.email='${state.invitee.email}' and m.tenant_id='${state.tenantId}'`);
    const [mid, mstatus, mrole] = membership.split('|');
    if (mstatus !== 'active') {
      record('A1', 'role without ledger.entry.read — NOT RUN (needs phase C to have made the invitee an active staff member)', false, membership);
    } else {
      psql(`update platform_membership set permissions_override='{"deny":["ledger.entry.read"]}'::jsonb, permissions_version=permissions_version+1 where id='${mid}'`);
      note(`FIXTURE (psql): ${state.invitee.email} (${mrole}) given permissions_override deny ledger.entry.read in ${shop}`);
      const t = await login(state.invitee.email, state.invitee.password);
      await must('PATCH', `/memberships/${mid}`, { is_default: true }, t);
      const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pg = await c.newPage();
      await signIn(pg, state.invitee);
      const who = await whoAmI(pg);
      const perms = who.data?.permissions ?? [];
      record('A1', `signed in as ${mrole} in ${shop} WITHOUT ledger.entry.read`,
        who.email === state.invitee.email && who.data?.active_tenant_id === state.tenantId && !perms.includes('ledger.entry.read') && perms.includes('parties.party.read'),
        `${who.email} tenant=${who.data?.active_tenant_id} ledger.entry.read=${perms.includes('ledger.entry.read')}`);
      await openKhata(pg, P.ramesh, /Ramesh Traders/);
      const items = await menuItems(pg);
      record('A1', 'no ledger.entry.read: "Send reminder" hidden on a receivable party', !items?.includes('Send reminder'), `menu=${JSON.stringify(items)}`);
      await c.close();
      // restore: invitee back to their own business by default, override removed
      psql(`update platform_membership set permissions_override='{}'::jsonb where id='${mid}'`);
      const own = psql(`select m.id from platform_membership m join platform_user u on u.id=m.user_id where u.email='${state.invitee.email}' and m.tenant_id='${state.inviteeTenantId}'`);
      await must('PATCH', `/memberships/${own}`, { is_default: true }, await login(state.invitee.email, state.invitee.password));
    }
  }

  // ── A11 the sheet at five widths; phone is a bottom sheet with no overflow ─
  for (const size of SIZES) {
    const c = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const pg = await c.newPage();
    await signIn(pg, state.owner);
    await openKhata(pg, P.ramesh, /Ramesh Traders/);
    const sh = await openReminder(pg);
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: shotPath(size.id, 'A-reminder-sheet') });
    const box = await sh.boundingBox();
    const over = await overflowPx(pg);
    const clipped = await sh.evaluate((el) => [...el.querySelectorAll('span,h2,p,a,button')].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible').map((n) => n.textContent.trim().slice(0, 30)));
    record('A11', `${size.id} ${size.width}px: no horizontal overflow with the sheet open`, over <= 0, `overflow ${over}px`);
    record('A11', `${size.id}: no text clipped inside the sheet`, clipped.length === 0, JSON.stringify(clipped));
    if (size.id === 'phone') {
      record('A11', 'phone: the sheet is a BOTTOM sheet (full width, flush with the bottom edge)',
        Boolean(box) && Math.abs(box.x) <= 1 && Math.abs(box.width - size.width) <= 1 && Math.abs(box.y + box.height - size.height) <= 1,
        JSON.stringify(box));
    } else {
      record('A11', `${size.id}: the sheet is a centred dialog inside the viewport`,
        Boolean(box) && box.x > 0 && box.x + box.width < size.width && box.y >= 0 && box.y + box.height <= size.height, JSON.stringify(box));
    }
    await c.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// B — PTY-02 §9, the party list's states
// ═════════════════════════════════════════════════════════════════════════════
/** Records, from the first paint, every text the totals region shows and the skeleton counts. */
const LIST_OBSERVER = () => {
  window.__qa = { stats: [], zeroSeen: [], statSkeleton: 0, rowSkeletonMax: 0, seq: [], t0: performance.now() };
  const scan = () => {
    const q = window.__qa;
    const grid = document.querySelector('[data-testid="ub-stat-grid"]');
    if (grid) {
      const text = grid.innerText.replace(/\s+/g, ' ').trim();
      if (q.stats[q.stats.length - 1] !== text) q.stats.push(text);
      if (/₹\s?0\.00/.test(text)) q.zeroSeen.push(`${Math.round(performance.now() - q.t0)}ms: ${text}`);
      q.statSkeleton = Math.max(q.statSkeleton, grid.querySelectorAll('[aria-busy="true"]').length);
    }
    const busy = document.querySelector('[data-testid="ub-grid"] [role="status"][aria-busy="true"]');
    let n = 0;
    if (busy) {
      n = busy.querySelectorAll('tbody tr').length || busy.children.length;
      q.rowSkeletonMax = Math.max(q.rowSkeletonMax, n);
    }
    const sig = `${location.pathname} appBusy=${document.querySelectorAll('[aria-busy="true"]').length} grid=${Boolean(document.querySelector('[data-testid="ub-grid"]'))} statSk=${grid ? grid.querySelectorAll('[aria-busy="true"]').length : '-'} rowSk=${n} rows=${/Ramesh Traders/.test(document.querySelector('[data-testid="ub-grid"]')?.innerText ?? '')}`;
    if (q.seq[q.seq.length - 1]?.sig !== sig) q.seq.push({ t: Math.round(performance.now() - q.t0), sig });
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  document.addEventListener('DOMContentLoaded', scan);
};

const gridRowCount = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('[data-testid="ub-grid"]');
    if (!g) return -1;
    const tableRows = g.querySelectorAll('table tbody tr[data-row-id], table tbody tr[aria-rowindex]');
    if (tableRows.length) return tableRows.length;
    return [...g.querySelectorAll('a, button, [role="link"]')].filter((el) => /Traders|Suppliers|Stores|Provision|Textiles|Hardware|Dairy|Bakers|Electricals|Medical|Tailors|Stationers/.test(el.textContent ?? '')).length;
  });
const partyNamesOnScreen = (page) =>
  page.evaluate(() => {
    const names = ['Ramesh Traders', 'Mahesh Suppliers', 'Suresh Settled Stores', 'Ganesh Provision', 'Priya Textiles', 'Anil Hardware', 'Kavita Dairy', 'Lakshmi Bakers', 'Om Sai Electricals', 'Vijay Medical', 'Sunita Tailors'];
    const g = document.querySelector('[data-testid="ub-grid"]');
    const t = g?.innerText ?? '';
    return names.filter((n) => t.includes(n));
  });

async function listStatesFor(browser, state, size) {
  const tag = size.id;
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await ctx.newPage();
  await signIn(page, state.owner);
  const who = await whoAmI(page);
  record('B', `${tag}: signed in as the OWNER`, who.email === state.owner.email, who.email);

  // ── B1 cold open on a throttled link ──────────────────────────────────────
  // Pass 1: CDP throttle only (uniform 1.2 s RTT, 400 KB/s). Pass 2: the same,
  // plus the list endpoint itself 3 s slow — the state the FRD describes is
  // the list request outliving /auth/me, which a uniform throttle may not produce.
  await page.addInitScript(LIST_OBSERVER);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  for (const pass of ['cdp', 'cdp+slow-list']) {
    const slow = /\/api\/v1\/parties\?/;
    if (pass === 'cdp+slow-list') await page.route(slow, async (route) => { await sleep(3000); await route.continue(); });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1200, downloadThroughput: 400 * 1024, uploadThroughput: 200 * 1024 });
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'commit', timeout: 180000 });
    let shotTaken = false;
    for (let i = 0; i < 600; i += 1) {
      const loading = await page.evaluate(() => Boolean(document.querySelector('[data-testid="ub-stat-grid"] [aria-busy="true"]')) && Boolean(document.querySelector('[data-testid="ub-grid"] [role="status"][aria-busy="true"]'))).catch(() => false);
      if (loading) {
        await page.waitForTimeout(150);
        await page.screenshot({ path: shotPath(tag, `B1-cold-open-loading-${pass}`) });
        shotTaken = true;
        // B7 in the LOADING state too: the page, and each shimmer inside its own card.
        const m = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('[data-testid="ub-stat-grid"] [aria-busy="true"]')].filter((c) => c.getBoundingClientRect().width > 0);
          return {
            page: document.documentElement.scrollWidth - window.innerWidth,
            cards: cards.map((c) => Math.round(Math.max(...[...c.querySelectorAll('*')].map((k) => k.getBoundingClientRect().right)) - c.getBoundingClientRect().right)),
          };
        });
        record('B7', `${tag} [${pass}]: the LOADING state fits the viewport`, m.page <= 0, `page overflow ${m.page}px`);
        record('B7', `${tag} [${pass}]: each totals shimmer stays inside its card`, m.cards.every((o) => o <= 0), `shimmer overflow per card (px) ${JSON.stringify(m.cards)}`);
        break;
      }
      await page.waitForTimeout(40);
    }
    await page.getByText('Ramesh Traders').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    if (pass === 'cdp+slow-list') await page.unroute(slow);
    const q = await page.evaluate(() => window.__qa);
    const finalStats = q.stats[q.stats.length - 1] ?? '';
    note(`${tag} ${pass} sequence: ${q.seq.map((x) => `${x.t}ms ${x.sig}`).join('  →  ').slice(0, 1500)}`);
    if (pass === 'cdp') {
      // Uniform throttling: the warm-up request overlaps /auth/me, so the list
      // may land before the list screen mounts. What must hold is that the wait
      // was covered by a skeleton (app-level or list-level) and never by ₹0.00.
      const covered = q.seq.some((x) => /appBusy=[1-9]/.test(x.sig));
      record('B1', `${tag} [cdp]: the wait was covered by a skeleton (list skeleton seen: ${shotTaken ? 'yes' : 'no — rows arrived before the list mounted'})`, covered || shotTaken, q.seq.map((x) => `${x.t}ms ${x.sig}`).join(' → ').slice(0, 400));
    } else {
      record('B1', `${tag} [${pass}]: the list's loading state (skeleton totals AND skeleton rows) was on screen`, shotTaken, shotTaken ? shotPath(tag, `B1-cold-open-loading-${pass}`) : 'never observed');
      record('B1', `${tag} [${pass}]: totals shimmer while loading (≥2 skeleton cards)`, q.statSkeleton >= 2, `max skeleton cards=${q.statSkeleton}`);
      record('B1', `${tag} [${pass}]: 8 skeleton rows while loading`, q.rowSkeletonMax === 8, `max skeleton rows=${q.rowSkeletonMax}`);
    }
    record('B1', `${tag} [${pass}]: the totals NEVER showed ₹0.00 on the way in`, q.zeroSeen.length === 0 && q.stats.length > 0, q.zeroSeen.slice(0, 3).join(' ; ') || `${q.stats.length} distinct texts`);
    record('B1', `${tag} [${pass}]: and landed on the real figures (₹1,27,767.28 / ₹2,250.00)`,
      finalStats.includes('1,27,767.28') && finalStats.includes('2,250.00'), finalStats);
  }
  await page.screenshot({ path: shotPath(tag, 'B0-loaded') });
  record('B7', `${tag}: loaded list fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);

  // ── B2 a filter chip on a slow link keeps rows dimmed under a progress bar ─
  await page.route(/\/api\/v1\/parties\?.*balance=owes_me/, async (route) => {
    await sleep(4000);
    await route.continue();
  });
  const before = await partyNamesOnScreen(page);
  await page.getByRole('button', { name: /^Owes me/ }).first().click();
  await page.waitForTimeout(900);
  const busyBar = await page.locator('[data-testid="ub-grid-busy"]').count();
  const dim = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="ub-grid"] [aria-busy="true"]:not([role="status"])');
    return el ? { opacity: getComputedStyle(el).opacity, busy: el.getAttribute('aria-busy') } : null;
  });
  const during = await partyNamesOnScreen(page);
  await page.screenshot({ path: shotPath(tag, 'B2-filter-slow-dimmed') });
  record('B2', `${tag}: while the chip's request is in flight a progress bar shows`, busyBar === 1, `progressbar count=${busyBar}`);
  record('B2', `${tag}: the previous rows stay on screen, dimmed (opacity 0.6, aria-busy)`, during.length >= before.length && before.length > 0 && dim?.opacity === '0.6', `before=${before.length} during=${during.length} ${JSON.stringify(dim)}`);
  await page.waitForTimeout(4500);
  const after = await partyNamesOnScreen(page);
  record('B2', `${tag}: then the filtered rows replace them (no payable/settled party left)`,
    after.includes('Ramesh Traders') && !after.includes('Mahesh Suppliers') && !after.includes('Suresh Settled Stores') && (await page.locator('[data-testid="ub-grid-busy"]').count()) === 0, JSON.stringify(after));
  await page.unroute(/\/api\/v1\/parties\?.*balance=owes_me/);
  await page.getByRole('button', { name: /^Owes me/ }).first().click(); // back to everyone
  await page.getByText('Mahesh Suppliers').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);

  // ── B5 stale cache: same-query refresh fails → rows stay under a banner ───
  let blocked = 0;
  const block = async (route) => {
    if (route.request().method() === 'GET') { blocked += 1; return route.abort('failed'); }
    return route.continue();
  };
  const listUrl = /\/api\/v1\/parties(\?|$)/;
  await page.route(listUrl, block);
  // same query: open a party, come back (client-side), the list refetches the SAME filters
  await page.getByRole('button', { name: 'Open Kavita Dairy' }).first().click();
  await page.getByRole('heading', { name: /Kavita Dairy/ }).first().waitFor({ timeout: 30000 });
  await page.goBack();
  await page.getByText('Showing saved list').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  const staleBanner = await page.getByText('Showing saved list').count();
  const staleRows = await partyNamesOnScreen(page);
  const staleTiles = await page.locator('[data-testid="ub-stat-grid"]').count();
  await page.screenshot({ path: shotPath(tag, 'B5-stale-saved-list') });
  record('B5', `${tag}: a failed same-query refresh was actually attempted (GET /parties aborted)`, blocked > 0, `blocked GETs=${blocked}`);
  record('B5', `${tag}: rows stay under the "Showing saved list" banner`, staleBanner > 0 && staleRows.length >= 10, `banner=${staleBanner} rows=${staleRows.length}`);
  record('B5', `${tag}: and the totals stay (they are this query's)`, staleTiles === 1);
  record('B7', `${tag}: stale state fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);

  // different query while still blocked → full error state
  const errBefore = blocked;
  await page.getByRole('button', { name: /^I owe/ }).first().click();
  await page.getByText('We could not load your customers').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  const errText = await page.locator('[data-testid="ub-grid"]').innerText().catch(() => '');
  const errRows = await partyNamesOnScreen(page);
  const errTiles = await page.locator('[data-testid="ub-stat-grid"]').count();
  const errBanner = await page.getByText('Showing saved list').count();
  await page.screenshot({ path: shotPath(tag, 'B5-error-different-query') });
  record('B5', `${tag}: a DIFFERENT query while blocked shows the full error state`, errText.includes('We could not load your customers') && blocked > errBefore, errText.replace(/\n/g, ' | ').slice(0, 200));
  record('B5', `${tag}: the error carries a request id (Reference …)`, /Reference\s*[:·]?\s*\S{6,}/.test(errText), errText.replace(/\n/g, ' | ').slice(0, 300));
  record('B5', `${tag}: no tiles, no saved rows and no stale banner in the error state`, errTiles === 0 && errRows.length === 0 && errBanner === 0, `tiles=${errTiles} rows=${errRows.length} banner=${errBanner}`);
  record('B7', `${tag}: error state fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);

  // Try again recovers once the link is back
  await page.unroute(listUrl, block);
  const retryReq = page.waitForRequest((r) => /\/api\/v1\/parties\?/.test(r.url()) && r.method() === 'GET', { timeout: 15000 }).catch(() => null);
  await page.locator('[data-testid="ub-grid"]').getByRole('button', { name: 'Try again' }).click();
  const rq = await retryReq;
  await page.getByText('Mahesh Suppliers').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const recovered = await partyNamesOnScreen(page);
  record('B5', `${tag}: Try again re-sends the SAME (I owe) query and recovers`,
    Boolean(rq) && /balance=i_owe/.test(rq.url()) && recovered.includes('Mahesh Suppliers') && !recovered.includes('Ramesh Traders') && (await page.getByText('We could not load your customers').count()) === 0 && (await page.locator('[data-testid="ub-stat-grid"]').count()) === 1,
    `${rq?.url().split('/api/v1')[1]} → ${JSON.stringify(recovered)}`);
  await page.screenshot({ path: shotPath(tag, 'B5-recovered') });
  if (size.id === 'desktop') {
    // Control for B6: the OWNER's selection bar does carry Archive, so its
    // absence for the accountant is about the role and not the bar.
    await page.getByRole('button', { name: /^I owe/ }).first().click();
    await page.getByText('Ramesh Traders').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const boxes = page.locator('[data-testid="ub-grid"] [role="checkbox"]');
    await boxes.nth(1).click();
    await boxes.nth(2).click();
    await page.waitForTimeout(600);
    record('B6', 'control — the OWNER\'s selection bar offers Archive', (await page.getByRole('button', { name: /^Archive$/ }).count()) === 1);
  }
  // Control: the same different-query failure answered BY THE SERVER (500 with
  // X-Request-Id) — separates "never shows a reference" from "not on a network failure".
  const serverErr = async (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', headers: { 'X-Request-Id': 'qa-req-5f2e9a71', 'Access-Control-Allow-Origin': FRONTEND, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Expose-Headers': 'X-Request-Id' }, body: JSON.stringify({ success: false, error: { code: 'server_error', message: 'Something went wrong on our side.', request_id: 'qa-req-5f2e9a71' } }) })
    : route.continue();
  await page.route(listUrl, serverErr);
  await page.getByRole('button', { name: /^Settled/ }).first().click();
  await page.getByText('We could not load your customers').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  const err500 = await page.locator('[data-testid="ub-grid"]').innerText().catch(() => '');
  await page.screenshot({ path: shotPath(tag, 'B5-error-server-500') });
  record('B5', `${tag}: control — a SERVER error (500 + X-Request-Id) does show the reference`, err500.includes('qa-req-5f2e9a71'), err500.replace(/\n/g, ' | ').slice(0, 300));
  await page.unroute(listUrl, serverErr);
  await ctx.close();
}

async function phaseB(browser, state) {
  // ── B3 a brand-new tenant; B4 Archived tab with nobody archived ───────────
  // The invitee's own "Gupta General Store" is a real empty book. (If phase C
  // has run, the invitee's default is still their own business.)
  // A rerun finds Mohan Stationers (added below for B4) in that book; he is
  // hidden with deleted_at for the B3 check and put back straight after.
  const hidden = psql(`update parties_party set deleted_at=now() where tenant_id='${state.inviteeTenantId}' and deleted_at is null returning id`).split('\n').filter(Boolean);
  if (hidden.length) note(`FIXTURE (psql): ${hidden.length} party in ${state.inviteeShop} soft-deleted for the new-tenant check, restored after`);
  try {
    for (const size of [PHONE, DESKTOP]) {
      const tag = size.id;
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await ctx.newPage();
      await signIn(page, state.invitee);
      const who = await whoAmI(page);
      record('B3', `${tag}: signed in as the invitee, in their own (empty) business`, who.email === state.invitee.email && who.data?.active_tenant_id === state.inviteeTenantId, `${who.email} ${who.data?.active_tenant?.name}`);
      await page.goto(`${FRONTEND}/parties`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 60000 });
      await page.waitForTimeout(1500);
      const tiles = await page.locator('[data-testid="ub-stat-grid"]').count();
      const gridAdd = await page.locator('[data-testid="ub-grid"]').getByRole('button', { name: /Add/ }).allInnerTexts();
      const pageAdd = await page.getByRole('button', { name: 'Add party' }).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
      const importish = await page.getByText(/Import|Contacts|CSV/i).count();
      const body = await page.locator('[data-testid="ub-grid"]').innerText().catch(() => '');
      await page.screenshot({ path: shotPath(tag, 'B3-new-tenant-empty') });
      record('B3', `${tag}: new tenant — no money tiles`, tiles === 0, `tiles=${tiles}`);
      record('B3', `${tag}: new tenant — the empty state offers a single "Add party"`, gridAdd.length === 1 && gridAdd[0].trim() === 'Add party', JSON.stringify(gridAdd));
      note(`${tag}: visible "Add party" controls on the whole page = ${pageAdd} (header + empty state)`);
      record('B3', `${tag}: new tenant — no Import / Contacts`, importish === 0, `matches=${importish}`);
      record('B3', `${tag}: new tenant — first-use copy "No customers yet"`, /No customers yet/i.test(body), body.replace(/\n/g, ' | ').slice(-160));
      record('B7', `${tag}: new-tenant state fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);
      await ctx.close();
    }
  } finally {
    if (hidden.length) psql(`update parties_party set deleted_at=null where id in (${hidden.map((h) => `'${h}'`).join(',')})`);
  }
  // one active party so the Archived tab is empty in a NON-empty book
  if (Number(psql(`select count(*) from parties_party where tenant_id='${state.inviteeTenantId}'`)) === 0) {
    const t = await login(state.invitee.email, state.invitee.password);
    await must('POST', '/parties', { name: 'Mohan Stationers', is_customer: true, mobile: '9812300001', opening_balance_amount: '640.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(10) }, t, { 'Idempotency-Key': `mohan-${state.stamp}` });
  }
  for (const size of [PHONE, DESKTOP]) {
    const tag = size.id;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    await signIn(page, state.invitee);
    await page.goto(`${FRONTEND}/parties?status=archived`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(2000);
    let body = await page.locator('[data-testid="ub-grid"]').innerText().catch(() => '');
    if (!/archived/i.test(body)) {
      // fall back to the status select
      const sel = page.getByLabel(/status/i).first();
      await sel.click().catch(() => {});
      await page.getByRole('option', { name: /Archived/ }).click().catch(() => {});
      await page.waitForTimeout(2000);
      body = await page.locator('[data-testid="ub-grid"]').innerText().catch(() => '');
    }
    const addInGrid = await page.locator('[data-testid="ub-grid"]').getByRole('button', { name: /Add/ }).count();
    await page.screenshot({ path: shotPath(tag, 'B4-archived-empty') });
    record('B4', `${tag}: Archived tab with nobody archived says "No archived customers"`, body.includes('No archived customers'), body.replace(/\n/g, ' | ').slice(0, 200));
    record('B4', `${tag}: and offers no Add in the empty state`, addInGrid === 0, `Add buttons in grid=${addInGrid}`);
    record('B4', `${tag}: not the first-use copy`, !/No customers yet/i.test(body));
    record('B7', `${tag}: archived-empty fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);
    await ctx.close();
  }

  // ── B1/B2/B5 on the owner's populated book, phone + desktop ───────────────
  for (const size of [PHONE, DESKTOP]) await listStatesFor(browser, state, size);

  // ── B6 accountant: no Add party, no Archive in the selection bar ──────────
  for (const size of [PHONE, DESKTOP]) {
    const tag = size.id;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    await signIn(page, state.accountant);
    const who = await whoAmI(page);
    record('B6', `${tag}: signed in as the ACCOUNTANT`, who.email === state.accountant.email && !(who.data?.permissions ?? []).includes('parties.party.write'), who.email);
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByText('Ramesh Traders').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1000);
    const add = await page.getByRole('button', { name: /Add party/ }).count();
    record('B6', `${tag}: accountant — no "Add party"`, add === 0, `count=${add}`);
    if (size.id === 'desktop') {
      const boxes = page.locator('[data-testid="ub-grid"] [role="checkbox"]');
      const n = await boxes.count();
      if (n > 2) {
        await boxes.nth(1).click();
        await boxes.nth(2).click();
        await page.waitForTimeout(600);
        const bar = await page.getByText(/selected/).first().innerText().catch(() => '');
        const archiveBtn = await page.getByRole('button', { name: /^Archive$/ }).count();
        const tagBtn = await page.getByRole('button', { name: /Add tag|Tag/ }).count();
        await page.screenshot({ path: shotPath(tag, 'B6-accountant-selection') });
        record('B6', 'accountant — selection bar appears for 2 rows', /2 selected/.test(bar), bar);
        record('B6', 'accountant — no Archive in the selection bar', archiveBtn === 0, `archive=${archiveBtn} tag=${tagBtn}`);
      } else {
        record('B6', 'accountant — selection checkboxes present at desktop', false, `checkboxes=${n}`);
      }
    } else {
      await page.screenshot({ path: shotPath(tag, 'B6-accountant-list') });
    }
    record('B7', `${tag}: accountant list fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C — PLT-05: an invited membership reserves a seat and grants nothing
// ═════════════════════════════════════════════════════════════════════════════
const beLogInfo = () => {
  const pid = (() => { try { return execFileSync('pgrep', ['-f', 'manage.py runserver']).toString().trim().split('\n')[0]; } catch { return null; } })();
  const st = existsSync(BE_LOG) ? statSync(BE_LOG) : null;
  return { pid, size: st?.size ?? 0, ino: st?.ino ?? 0 };
};
/**
 * Every row or card holding `needle` — the team screen shows the invitee twice
 * (the invited MEMBERSHIP in the team list, and the pending INVITATION in the
 * invitations list), so the check picks the membership row: the one that is
 * not in the invitations list (which carries "Waiting" and "Revoke").
 */
const rowText = (page, needle) =>
  page.evaluate((n) => {
    const sel = 'tr, li, [role="row"], [role="listitem"], article, [data-testid*="card"], [data-testid*="row"]';
    const all = [...document.querySelectorAll(sel)].filter((el) => el.textContent.includes(n));
    const minimal = all.filter((el) => ![...el.querySelectorAll(sel)].some((c) => c.textContent.includes(n)));
    const rows = minimal.map((el) => ({ text: el.innerText, buttons: [...el.querySelectorAll('button, a')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean) }));
    const member = rows.find((r) => !/Waiting|Revoke/.test(r.text)) ?? null;
    return member ? { ...member, all: rows } : { text: '', buttons: [], all: rows };
  }, needle);

async function phaseC(browser, state) {
  const inviteeEmail = state.invitee.email;
  const ownerToken = await login(state.owner.email, state.owner.password);
  const existing = psql(`select m.status from platform_membership m join platform_user u on u.id=m.user_id where u.email='${inviteeEmail}' and m.tenant_id='${state.tenantId}'`);
  if (existing) note(`the invitee already has a '${existing}' membership in ${state.shop} from an earlier run — the create path was exercised then; this run exercises the reuse path (BR-7)`);
  const logBefore = beLogInfo();

  // ── C0 the plan and its seats ─────────────────────────────────────────────
  let me = (await must('GET', '/auth/me', null, ownerToken)).body.data;
  note(`owner plan on sign-up: ${me.plan_limits.plan_code}, max_users ${JSON.stringify(me.plan_limits.limits.max_users)}`);

  // ── C1 owner is not an invitable role ─────────────────────────────────────
  const asOwner = await api('POST', '/invitations', { email: inviteeEmail, role: 'owner' }, ownerToken, { 'Idempotency-Key': `inv-owner-${Date.now()}` });
  record('C1', 'inviting with role "owner" → 400', asOwner.status === 400, `${asOwner.status} ${JSON.stringify(asOwner.body?.error ?? asOwner.body).slice(0, 200)}`);
  const noRowAfterOwner = psql(`select count(*) from platform_membership m join platform_user u on u.id=m.user_id where u.email='${inviteeEmail}' and m.tenant_id='${state.tenantId}' and m.status in ('invited','active')`);
  record('C1', 'and the refused owner invite created no membership', noRowAfterOwner === '0', `rows=${noRowAfterOwner}`);

  // ── C2 move to the `free` plan (max_users 3) for the seat checks ──────────
  const originalPlan = psql(`select plan_id from platform_tenant where id='${state.tenantId}'`);
  psql(`update platform_tenant set plan_id=(select id from platform_plan where code='free') where id='${state.tenantId}'`);
  note(`FIXTURE (psql): ${state.shop} moved to plan 'free' for the seat check (restored at the end)`);
  me = (await must('GET', '/auth/me', null, ownerToken)).body.data;
  const seats = me.plan_limits.limits.max_users;
  record('C2', `plan 'free' reports max_users ${seats.limit}, ${seats.used} used (owner + accountant)`, seats.limit === 3 && seats.used === 2, JSON.stringify(me.plan_limits));

  try {
    // ── C3 invite an address that already has an account ────────────────────
    const inv1 = await api('POST', '/invitations', { email: inviteeEmail, role: 'staff' }, ownerToken, { 'Idempotency-Key': `inv1-${Date.now()}` });
    const token1 = inv1.body?.data?.accept_url?.split('/').pop();
    record('C3', 'invite an existing account as staff → 201 with an accept_url', inv1.status === 201 && Boolean(token1), `${inv1.status} ${JSON.stringify(inv1.body?.data ?? inv1.body).slice(0, 200)}`);
    const invitationId1 = inv1.body?.data?.id;
    me = (await must('GET', '/auth/me', null, ownerToken)).body.data;
    record('C3', 'the invitation reserves a seat (used 2 → 3)', me.plan_limits.limits.max_users.used === 3, JSON.stringify(me.plan_limits.limits.max_users));

    // ── C4 beyond the seats ─────────────────────────────────────────────────
    const over = await api('POST', '/invitations', { email: `vikas.patil.${state.stamp}@patilagency.test`, role: 'staff' }, ownerToken, { 'Idempotency-Key': `inv-over-${Date.now()}` });
    record('C4', 'a 4th seat on max_users 3 → 403 plan_limit_reached', over.status === 403 && over.body?.error?.code === 'plan_limit_reached', `${over.status} ${JSON.stringify(over.body?.error ?? over.body).slice(0, 250)}`);
    const overMember = await api('POST', '/members', { full_name: 'Vikas Patil', email: `vikas.patil2.${state.stamp}@patilagency.test`, role: 'staff' }, ownerToken, { 'Idempotency-Key': `mem-over-${Date.now()}` });
    record('C4', 'and creating a login for a 4th person is refused the same way', overMember.status === 403 && overMember.body?.error?.code === 'plan_limit_reached', `${overMember.status} ${overMember.body?.error?.code}`);

    // ── C5 the team list (API) ──────────────────────────────────────────────
    const members = (await must('GET', '/members', null, ownerToken)).body.data;
    const row = members.find((m) => m.email === inviteeEmail);
    record('C5', 'GET /members lists the invitee as status "invited"', row?.status === 'invited', JSON.stringify(row));
    record('C5', 'with no name, mobile, last login or password state', row && row.full_name === null && row.mobile === null && row.last_login_at === null && row.must_change_password === false && row.password_expires_at === null, JSON.stringify(row));
    const invitedId = row?.id;

    // ── C6 the team screen, owner, phone + desktop ──────────────────────────
    for (const size of [PHONE, DESKTOP]) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await ctx.newPage();
      await signIn(page, state.owner);
      await page.goto(`${FRONTEND}/settings/team`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.getByText(inviteeEmail).first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: shotPath(size.id, 'C-team-invited-row'), fullPage: true });
      const r = await rowText(page, inviteeEmail);
      const whole = await page.locator('main').innerText();
      record('C6', `${size.id}: the invitee's row reads "Invited — has not joined yet"`, Boolean(r?.text.includes('Invited — has not joined yet')), JSON.stringify(r));
      record('C6', `${size.id}: no name ("${state.invitee.name}") and no mobile on the page`, !whole.includes(state.invitee.name) && !/98\d{3}\s?\d{5}/.test(r?.text ?? ''), '');
      record('C6', `${size.id}: no "New password" button on the invited row`, Boolean(r) && !r.buttons.some((b) => /New password/i.test(b)), JSON.stringify(r?.buttons));
      record('C6', `${size.id}: team screen fits the viewport`, (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);
      await ctx.close();
    }

    // ── C7–C9 the invitee: sees it, cannot use it ───────────────────────────
    const inviteeToken = await login(inviteeEmail, state.invitee.password);
    const ime = (await must('GET', '/auth/me', null, inviteeToken)).body.data;
    const listed = ime.tenants.find((t) => t.id === state.tenantId);
    record('C7', "invitee's /auth/me lists the business with status invited", listed?.status === 'invited', JSON.stringify(listed));
    record('C7', "invitee stays in their own business (active tenant is not the inviting one)", ime.active_tenant_id === state.inviteeTenantId, ime.active_tenant_id);
    const sw = await api('POST', '/auth/switch-tenant', { tenant_id: state.tenantId }, inviteeToken);
    record('C8', 'switching into the invited business → 403', sw.status === 403, `${sw.status} ${JSON.stringify(sw.body?.error ?? sw.body).slice(0, 160)}`);

    // X-Tenant-Id is not a way in
    const hdr = await api('GET', '/parties?page_size=100', null, inviteeToken, { 'X-Tenant-Id': state.tenantId });
    const hdrNames = (hdr.body?.data ?? []).map((p) => p.name);
    record('C9', 'X-Tenant-Id forced to the inviting business → still only the invitee\'s own book', hdr.status === 200 && !hdrNames.includes('Ramesh Traders'), `${hdr.status} ${JSON.stringify(hdrNames)}`);
    // A token minted FOR the inviting tenant on the invited membership (what a
    // bug in switch/refresh/login-default would hand out) — tenancy must refuse it.
    const forced = djangoShell(`
from apps.platform_app.models import Membership
from apps.platform_app.services import sessions
m = Membership.objects.select_related('user','tenant').get(id='${invitedId}')
print('STATUS', m.status)
issued = sessions.issue(user=m.user, tenant=m.tenant, membership=m, device_label='qa-forced', user_agent='qa', ip='127.0.0.1')
print('TOKEN', issued.access)
`);
    const forcedToken = /TOKEN (\S+)/.exec(forced)?.[1];
    note(`forced token minted on a membership with ${/STATUS (\S+)/.exec(forced)?.[1]} status`);
    const fParties = await api('GET', '/parties?page_size=100', null, forcedToken);
    const fNames = (fParties.body?.data ?? []).map?.((p) => p.name) ?? [];
    record('C9', 'a token forced to tid=<inviting tenant> gets no parties (403, no data)', [401, 403].includes(fParties.status) && !JSON.stringify(fParties.body).includes('Ramesh'), `${fParties.status} ${JSON.stringify(fParties.body).slice(0, 200)}`);
    const fMe = await api('GET', '/auth/me', null, forcedToken);
    record('C9', "and /auth/me under that token grants no permissions for the tenant", fMe.status === 200 && (fMe.body?.data?.permissions ?? []).length === 0 && fMe.body?.data?.active_tenant_id !== state.tenantId,
      `${fMe.status} permissions=${JSON.stringify(fMe.body?.data?.permissions)} active=${fMe.body?.data?.active_tenant_id}`);
    const fLedger = await api('GET', `/parties/${state.parties.ramesh}/ledger-entries`, null, forcedToken);
    record('C9', 'and cannot read a khata of the inviting business either', [401, 403, 404].includes(fLedger.status), `${fLedger.status}`);

    // the invitee's own screen: Invitations, not a switchable business
    for (const size of [PHONE, DESKTOP]) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await ctx.newPage();
      await signIn(page, state.invitee);
      await page.goto(`${FRONTEND}/switch`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(1500);
      const txt = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
      await page.screenshot({ path: shotPath(size.id, 'C-invitee-invitations'), fullPage: true });
      const invSection = txt.split('Invitations')[1] ?? '';
      record('C7', `${size.id}: the invitee sees "${state.shop}" under Invitations, marked Invited`, txt.includes('Invitations') && invSection.includes(state.shop) && invSection.includes('Invited'), txt.replace(/\n/g, ' | ').slice(0, 300));
      await ctx.close();
    }

    // ── C10 revoke before accept ───────────────────────────────────────────
    const rv = await api('DELETE', `/invitations/${invitationId1}`, null, ownerToken);
    record('C10', 'revoke the pending invitation → 2xx', rv.status >= 200 && rv.status < 300, `${rv.status}`);
    const afterRevoke = (await must('GET', '/members', null, ownerToken)).body.data.find((m) => m.email === inviteeEmail);
    record('C10', 'revoking removes the invited row from the team list', !afterRevoke, JSON.stringify(afterRevoke));
    me = (await must('GET', '/auth/me', null, ownerToken)).body.data;
    record('C10', 'and frees the seat (used 3 → 2)', me.plan_limits.limits.max_users.used === 2, JSON.stringify(me.plan_limits.limits.max_users));
    const deadLink = await api('POST', `/invitations/${token1}/accept`, {}, inviteeToken);
    record('C10', 'the revoked link then fails', deadLink.status >= 400 && deadLink.status < 500, `${deadLink.status} ${JSON.stringify(deadLink.body?.error ?? deadLink.body).slice(0, 160)}`);
    const stillNotMember = psql(`select count(*) from platform_membership m join platform_user u on u.id=m.user_id where u.email='${inviteeEmail}' and m.tenant_id='${state.tenantId}' and m.status='active'`);
    record('C10', 'and made nobody a member', stillNotMember === '0', `active rows=${stillNotMember}`);

    // ── C11 invite again, accept in the browser ────────────────────────────
    const inv2 = await must('POST', '/invitations', { email: inviteeEmail, role: 'staff' }, ownerToken, { 'Idempotency-Key': `inv2-${Date.now()}` });
    const token2 = inv2.body.data.accept_url.split('/').pop();
    const row2 = (await must('GET', '/members', null, ownerToken)).body.data.find((m) => m.email === inviteeEmail);
    record('C11', 're-invite → the invited row is back', row2?.status === 'invited', JSON.stringify(row2));
    const logMid = beLogInfo();
    {
      const ctx = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height } });
      const page = await ctx.newPage();
      await signIn(page, state.invitee);
      const acceptResp = page.waitForResponse((r) => r.url().includes('/accept') && r.request().method() === 'POST', { timeout: 60000 });
      await page.goto(`${FRONTEND}/accept-invite/${token2}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const resp = await acceptResp;
      await page.getByText('You have joined').first().waitFor({ timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await page.screenshot({ path: shotPath('desktop', 'C-accepted') });
      const body = await page.locator('body').innerText();
      record('C11', 'accept (browser) → 200 and "You have joined"', resp.status() === 200 && body.includes('You have joined'), `${resp.status()} ${body.replace(/\n/g, ' | ').slice(0, 160)}`);
      await ctx.close();
    }
    const row3 = (await must('GET', '/members', null, ownerToken)).body.data.find((m) => m.email === inviteeEmail);
    record('C11', 'the member is now active with the SAME membership id as the invited row', row3?.status === 'active' && row3?.id === row2?.id, `${row2?.id} → ${row3?.id} ${row3?.status}`);
    record('C11', 'and, being a member, the name now shows', row3?.full_name === state.invitee.name, row3?.full_name);
    const again = await api('POST', `/invitations/${token2}/accept`, {}, inviteeToken);
    const count = psql(`select count(*) from platform_membership m join platform_user u on u.id=m.user_id where u.email='${inviteeEmail}' and m.tenant_id='${state.tenantId}'`);
    record('C12', 'a second accept → 200', again.status === 200, `${again.status} ${JSON.stringify(again.body?.error ?? '').slice(0, 120)}`);
    record('C12', 'and no duplicate membership (exactly one row for that person and business)', count === '1', `rows=${count}`);
    me = (await must('GET', '/auth/me', null, ownerToken)).body.data;
    record('C12', 'the accepted seat is counted once (used 3)', me.plan_limits.limits.max_users.used === 3, JSON.stringify(me.plan_limits.limits.max_users));
    const inviteeSwitch = await api('POST', '/auth/switch-tenant', { tenant_id: state.tenantId }, await login(inviteeEmail, state.invitee.password));
    record('C12', 'the accepted invitee CAN now switch in (200)', inviteeSwitch.status === 200, `${inviteeSwitch.status}`);

    // ── C13 the tokens never reach the backend log ─────────────────────────
    await sleep(1500);
    const logAfter = beLogInfo();
    const log = readFileSync(BE_LOG, 'utf8');
    const sameServer = logBefore.pid === logAfter.pid && logAfter.ino === logBefore.ino && logAfter.size >= logMid.size;
    const acceptLines = log.split('\n').filter((l) => /invitations\/.*\/accept/.test(l));
    record('C13', 'the API was not restarted during C, so the log covers the whole flow', sameServer, `${JSON.stringify(logBefore)} → ${JSON.stringify(logAfter)}`);
    record('C13', 'the log DID record the accept requests (so absence of the token means something)', acceptLines.length >= 2, acceptLines.slice(-2).join(' || ').slice(0, 300));
    record('C13', 'neither raw token appears anywhere in be-run.log', !log.includes(token1) && !log.includes(token2), `token1 hits=${log.split(token1).length - 1} token2 hits=${log.split(token2).length - 1}`);
    const feLog = existsSync('/tmp/claude-0/fe-run.log') ? readFileSync('/tmp/claude-0/fe-run.log', 'utf8') : '';
    note(`(also checked) frontend log fe-run.log: token1 hits=${feLog.split(token1).length - 1}, token2 hits=${feLog.split(token2).length - 1}`);
    const auditHits = psql(`select count(*) from platform_audit_log where tenant_id='${state.tenantId}' and (metadata::text like '%${token2}%' or coalesce(after::text,'') like '%${token2}%' or coalesce(before::text,'') like '%${token2}%')`);
    note(`(also checked) platform_audit_log rows containing token2: ${auditHits}`);
    state.cDone = true;
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } finally {
    psql(`update platform_tenant set plan_id='${originalPlan}' where id='${state.tenantId}'`);
    note('FIXTURE restored: plan back to the original');
  }
}

const main = async () => {
  const state = await seed();
  if (process.argv.includes('--seed-only')) { console.log(JSON.stringify(state, null, 2)); return; }
  const browser = await chromium.launch();
  if (PHASES.includes('A')) await phaseA(browser, state);
  if (PHASES.includes('B')) await phaseB(browser, state);
  if (PHASES.includes('C')) await phaseC(browser, state);
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL [${r.id}] ${r.check}`);
  writeFileSync(`${SHOT_ROOT}/results-${PHASES.join('')}.json`, JSON.stringify(results, null, 2));
  process.exit(passed === results.length ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
