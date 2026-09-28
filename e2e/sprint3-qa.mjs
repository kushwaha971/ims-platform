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
 *   node e2e/sprint3-qa.mjs --only=A --joined   # seed the invitee as an accepted
 *                                           # staff member (the state C leaves)
 *
 * `run-regression.mjs` runs each phase as its own job in its own directory
 * (E2E_SPRINT3_DIR), with a fresh retest pair where one is read
 * (E2E_RT_ACCOUNTS), so no phase depends on another phase or an earlier run.
 *   node e2e/sprint3-qa.mjs --only=R        # retest of 2b365b6 (D1–D4, O3–O6);
 *                                           # one owner sign-in at most, reused
 *   node e2e/sprint3-qa.mjs --only=N        # retest of 8ccd186 + 5d7b99e (NEW-1…3);
 *   node e2e/sprint3-qa.mjs --only=N1,N2    # sub-phases by name; N4 (the IP
 *                                           # login lockout) runs ONLY when named
 *   node e2e/sprint3-qa.mjs --only=F        # final retest of 3f24388 + 5499db8 (F1 skeleton/
 *                                           # request id/phone format, F2 written-off totals,
 *                                           # F3 sign-in after cookie expiry); F1..F3 by name
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
// Every path below can be pointed elsewhere, which is what lets
// `run-regression.mjs` run each phase in its own directory, against its own
// freshly seeded accounts, concurrently with every other phase. The defaults
// are the historical single-run locations.
const SHOT_ROOT = process.env.E2E_SPRINT3_DIR ?? '/tmp/e2e-shots/sprint3-qa';
const STATE_FILE = `${SHOT_ROOT}/state.json`;
const BE_LOG = process.env.E2E_BE_LOG ?? '/tmp/claude-0/be-run.log';
const FE_LOG = process.env.E2E_FE_LOG ?? '/tmp/claude-0/fe-run.log';

const argOnly = process.argv.find((a) => a.startsWith('--only='));
const PHASES = argOnly ? argOnly.slice(7).split(',') : ['A', 'B', 'C'];
const FRESH = process.argv.includes('--fresh');
// `--joined`: seed the invitee as an ACTIVE staff member of the owner's
// business (invite + accept through the API), which is the state phase C
// leaves behind and the state A1's no-ledger-read role, R's "3 people ·
// 1 invited" heading and N1's two-business control read. Without it those
// checks only held on a rerun after C, against the same long-lived accounts.
const JOINED = process.argv.includes('--joined');

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
  { id: '2k', width: 2560, height: 1440 },
];
const PHONE = SIZES[0];
const DESKTOP = SIZES[3];
for (const size of SIZES) mkdirSync(`${SHOT_ROOT}/${size.id}`, { recursive: true });

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
    const acct = await must('POST', '/members', { full_name: state.accountant.name, email: state.accountant.email, role: 'accountant', mobile: `98${String(state.stamp).slice(-8)}` },
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
  // 4 — (--joined only) the invitee accepts a staff invitation, as C11 does in the browser
  if (JOINED) {
    await step('joined', async () => {
      const inv = await must('POST', '/invitations', { email: state.invitee.email, role: 'staff' }, token, { 'Idempotency-Key': `join-${state.stamp}` });
      const inviteToken = inv.body.data.accept_url.split('/').pop();
      await must('POST', `/invitations/${inviteToken}/accept`, {}, await login(state.invitee.email, state.invitee.password));
      note(`FIXTURE (API): ${state.invitee.email} invited as staff to ${state.shop} and accepted`);
    });
  }
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

/* LED-06 (wave 1) moved the message to the server: the sheet shows
   POST /reminders/preview's `text` (WhatsApp) and `sms_text` (SMS) verbatim, in
   the shop's message language, whatever the UI language. The expected text is
   read from that endpoint instead of being rebuilt from a client template. */
const serverPreview = async (owner, partyId) => {
  const token = await login(owner.email, owner.password);
  const r = await api('POST', '/reminders/preview', { party_id: partyId }, token, { 'Idempotency-Key': `pv-${Date.now()}-${Math.random()}` });
  return r.body?.data ?? { text: null, sms_text: null };
};

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
  const rameshPreview = await serverPreview(state.owner, P.ramesh);
  const expected = rameshPreview.text;
  const expectedSms = rameshPreview.sms_text ?? expected;
  record('A2', 'dialog title is "Send reminder"', s.title === 'Send reminder', s.title);
  // O6: the recipient is shown normalised ("+91 98123 45678"), as the link dials it.
  record('A2', 'recipient line "To {name} · {mobile}"', s.description === 'To Ramesh Traders · +91 98123 45678', s.description);
  record('A2', `preview is exactly the template, dated TODAY in the shop's timezone (IST ${today}; browser clock is UTC)`, s.preview === expected,
    JSON.stringify(s.preview));
  const wa = s.waHref ? new URL(s.waHref) : null;
  record('A3', 'WhatsApp href is https://wa.me/919812345678?text=… (09812345678 normalised)',
    Boolean(wa) && wa.origin === 'https://wa.me' && wa.pathname === '/919812345678' && [...wa.searchParams.keys()].join() === 'text', s.waHref);
  record('A3', 'WhatsApp text decodes to exactly the preview', wa?.searchParams.get('text') === expected);
  record('A3', 'WhatsApp link opens a new tab with rel noopener', s.waTarget === '_blank' && /\bnoopener\b/.test(s.waRel ?? ''), `${s.waTarget} ${s.waRel}`);
  const smsOk = s.smsHref?.startsWith('sms:+919812345678?&body=') && decodeURIComponent(s.smsHref.split('?&body=')[1] ?? '') === expectedSms;
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

  // ── A7 opening a channel records the reminder, and never says sent ────────
  // By design since LED-06's history strip: the tap on WhatsApp/SMS WRITES a
  // `ledger_reminder` row (POST /reminders) and marks it sent (POST
  // /reminders/{id}/send), which is what feeds the Sent tab. The harness now
  // asserts exactly those two writes and nothing else — no message provider
  // call, no second reminder.
  page.on('request', onRequest);
  sheet = await openReminder(page);
  apiRequests.length = 0;
  const popupPromise = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await sheet.getByRole('link', { name: 'WhatsApp' }).click();
  const popup = await popupPromise;
  await page.waitForTimeout(1500);
  const snackWa = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  record('A7', 'WhatsApp click opens a new tab at the wa.me URL', Boolean(popup) && (popup?.url() ?? '').startsWith('https://wa.me/919812345678?text='), popup?.url()?.slice(0, 60));
  const recordsOnce = (reqs) => {
    const writes = reqs.filter((r) => !r.startsWith('GET '));
    const created = writes.filter((r) => /^POST \S*\/reminders\/?$/.test(r));
    const sent = writes.filter((r) => /^POST \S*\/reminders\/[^/]+\/send\/?$/.test(r));
    return created.length === 1 && sent.length === 1 && writes.length === 2;
  };
  record('A7', 'WhatsApp click records the reminder: one POST /reminders + one POST /reminders/{id}/send, nothing else', recordsOnce(apiRequests), apiRequests.join(' ; '));
  record('A7', 'feedback says "WhatsApp opened", never "sent"',
    snackWa.some((t) => t.includes('WhatsApp opened')) && !snackWa.some((t) => /\bsent\b/i.test(t)), JSON.stringify(snackWa));
  record('A7', 'the sheet closes after WhatsApp', (await page.getByRole('dialog').count()) === 0);
  if (popup) await popup.close();

  sheet = await openReminder(page);
  apiRequests.length = 0;
  await sheet.getByRole('link', { name: 'SMS' }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const snackSms = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
  record('A7', 'SMS click records the reminder: one POST /reminders + one POST /reminders/{id}/send, nothing else', recordsOnce(apiRequests), apiRequests.join(' ; '));
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
    const exp = (await serverPreview(state.owner, P[key])).text;
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
    const hiExp = expected; // the message language is the shop's, not the UI's
    record('A10', 'Hindi: title "रिमाइंडर भेजें"', s.title === 'रिमाइंडर भेजें', s.title);
    record('A10', 'Hindi: recipient line', s.description === 'Ramesh Traders · +91 98123 45678 को', s.description);
    record('A10', 'Hindi: preview is the Hindi template', s.preview === hiExp, JSON.stringify(s.preview));
    record('A10', 'Hindi: WhatsApp text is the Hindi message', new URL(s.waHref).searchParams.get('text') === hiExp);
    await page.screenshot({ path: shotPath('desktop', 'A-sheet-hindi') });
    await closeTopDialog(page);
  }
  await ctx.clearCookies({ name: 'ub_locale' });
  record('A', 'no console errors on the owner khata/sheet pages', consoleErrors.filter((t) => !/401|Unauthorized/.test(t)).length === 0, consoleErrors.join(' ; ').slice(0, 400));
  await ctx.close();

  // ── A1 accountant: hidden by design ────────────────────────────────────────
  // Sending now writes a `ledger_reminder` row, so it needs
  // `ledger.reminder.write` (LED-06 §12), which the accountant does not hold.
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
    record('A1', 'accountant: "Send reminder" NOT shown (no ledger.reminder.write, by design)',
      !perms.includes('ledger.reminder.write') && !items?.includes('Send reminder'), JSON.stringify(items));
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
    const feLog = existsSync(FE_LOG) ? readFileSync(FE_LOG, 'utf8') : '';
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

// ═════════════════════════════════════════════════════════════════════════════
// R — retest of the fixes in 2b365b6 (D1–D4, O3–O6), `--only=R`
//
// The per-IP login budget (`login_ip`) counts successful sign-ins too, so this
// phase signs the owner in AT MOST ONCE and reuses a Playwright storageState
// for every check, at every width. API calls use the `ub_access` cookie from
// that same state as a Bearer token rather than a second /auth/login.
// ═════════════════════════════════════════════════════════════════════════════
const RT_DIR = `${SHOT_ROOT}/retest`;
const RT_STORAGE = `${RT_DIR}/owner-storage.json`;
const RT_STATE = `${RT_DIR}/state.json`;
const rtShot = (size, name) => `${RT_DIR}/${size}/${name}.png`;
let rtLogins = 0;

const ownerSession = async (browser, state, viewport, cookies = []) => {
  const ctx = await browser.newContext({ viewport, ...(existsSync(RT_STORAGE) ? { storageState: RT_STORAGE } : {}) });
  if (cookies.length) await ctx.addCookies(cookies);
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (route) => route.fulfill({ status: 200, body: 'intercepted' }));
  const page = await ctx.newPage();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      break;
    } catch (e) { if (attempt === 3) throw e; await sleep(5000); }
  }
  // Let the app refresh an expired access cookie before asking who we are.
  await page.waitForTimeout(3000);
  let me = await whoAmI(page).catch(() => ({ email: null }));
  if (me.email !== state.owner.email || page.url().includes('/login')) {
    rtLogins += 1;
    note(`browser sign-in #${rtLogins} this run (owner) — stored state absent or expired`);
    await signIn(page, state.owner);
    me = await whoAmI(page);
  }
  // Saved WITHOUT the locale cookie, so one Hindi check does not make every later session Hindi.
  const saved = await ctx.storageState();
  saved.cookies = saved.cookies.filter((c) => c.name !== 'ub_locale');
  writeFileSync(RT_STORAGE, JSON.stringify(saved));
  const token = (await ctx.cookies()).find((c) => c.name === 'ub_access')?.value ?? null;
  return { ctx, page, me, token };
};

/** The focused element, identified. `isMore` compares IDENTITY with the ⋯ recorded when it was focused. */
const focusInfo = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      tag: a?.tagName ?? null,
      label: a?.getAttribute?.('aria-label') ?? null,
      text: (a?.innerText ?? '').trim().slice(0, 40),
      isMore: Boolean(window.__qaMore) && a === window.__qaMore,
      isGave: Boolean(window.__qaGave) && a === window.__qaGave,
      moreConnected: Boolean(window.__qaMore?.isConnected),
      inDialog: Boolean(a?.closest?.('[role="dialog"],[role="alertdialog"]')),
    };
  });
/** Tab (keyboard only) until `match(focusInfo)`; returns the info or null. */
const tabTo = async (page, match, max = 80) => {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const f = await focusInfo(page);
    if (match(f)) return f;
  }
  return null;
};
const dialogCount = (page) => page.locator('[role="dialog"], [role="alertdialog"]').count();

async function d1Flow(page, size, { item, close, target, pass, tag }) {
  // Start from the document (as after a page load): nothing focused.
  await page.evaluate(() => document.activeElement?.blur?.());
  const more = await tabTo(page, (f) => f.label === 'More actions');
  if (!more) return { ok: false, detail: 'could not Tab to ⋯' };
  await page.evaluate(() => { window.__qaMore = document.activeElement; });
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').last().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  const itemFocus = await tabTo(page, (f) => f.inDialog && f.text === item, 20);
  if (!itemFocus) return { ok: false, detail: `could not Tab to "${item}" in the ⋯ sheet` };
  await page.keyboard.press('Enter');
  // the ⋯ sheet closes and the target dialog opens (lazily, on first use)
  await page.waitForFunction((t) => {
    const ds = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')];
    return ds.length >= 1 && ds.some((d) => d.innerText.includes(t));
  }, target, { timeout: 20000 });
  await page.waitForTimeout(700);
  const opened = await focusInfo(page);
  if (pass === 1) await page.screenshot({ path: rtShot(size, `D1-${tag}-open`) });
  if (close === 'Escape') {
    await page.keyboard.press('Escape');
  } else {
    const x = await tabTo(page, (f) => f.inDialog && /^(Close|बंद)/i.test(f.label ?? ''), 30);
    if (!x) return { ok: false, detail: `no ✕ reachable by Tab in "${target}" dialog (focus on open: ${JSON.stringify(opened)})` };
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(900);
  const left = await dialogCount(page);
  const f = await focusInfo(page);
  return { ok: left === 0 && f.isMore, detail: `dialogs=${left} focus=${JSON.stringify(f)} (focus when opened: ${opened.label ?? opened.text})` };
}

async function phaseR(browser, state) {
  mkdirSync(`${RT_DIR}/phone`, { recursive: true });
  mkdirSync(`${RT_DIR}/desktop`, { recursive: true });
  const P = state.parties;
  const rt = existsSync(RT_STATE) ? JSON.parse(readFileSync(RT_STATE, 'utf8')) : {};
  const saveRt = () => writeFileSync(RT_STATE, JSON.stringify(rt, null, 2));
  const loginBefore = psql(`select coalesce(max(count),0)||' since '||coalesce(max(window_start)::text,'-') from platform_rate_limit where scope='login_ip'`);
  note(`login_ip before R: ${loginBefore}`);

  // ── session + API token (no API login unless the cookie will not do) ─────
  let { ctx, page, me, token } = await ownerSession(browser, state, { width: DESKTOP.width, height: DESKTOP.height });
  record('R', 'signed in as the OWNER (stored session reused where valid)', me.email === state.owner.email, me.email);
  let probe = await api('GET', '/auth/me', null, token);
  if (probe.status !== 200) {
    rtLogins += 1;
    note(`API sign-in #${rtLogins} — ub_access cookie refused as Bearer (${probe.status})`);
    token = await login(state.owner.email, state.owner.password);
  }
  await ctx.close();

  // ── fixtures (API; restored at the end) ─────────────────────────────────
  // O4: Sunita Tailors gets two entries that net to zero and is archived; the
  // CONTROL is her own rows before archiving.
  if (!rt.sunitaEntries) {
    await must('POST', `/parties/${P.sunita}/ledger-entries`, { entry_date: daysAgo(2), direction: 'debit', amount: '250.00', note: 'Stitching thread' }, token, { 'Idempotency-Key': `rt-sun-1-${state.stamp}` });
    await must('POST', `/parties/${P.sunita}/ledger-entries`, { entry_date: daysAgo(1), direction: 'credit', amount: '250.00', note: 'Cash received', payment_mode: 'cash' }, token, { 'Idempotency-Key': `rt-sun-2-${state.stamp}` });
    rt.sunitaEntries = true; saveRt();
    note('FIXTURE (API): Sunita Tailors — You gave ₹250 and You got ₹250 (balance stays 0)');
  }
  // D4/O3: a pending invitation for an address that ALREADY has an account, so
  // the team shows both an invited member row and the invitation row.
  const r2 = JSON.parse(readFileSync(RT_ACCOUNTS, 'utf8')).R2.email;
  const inv = await api('POST', '/invitations', { email: r2, role: 'staff' }, token, { 'Idempotency-Key': `rt-inv-${Date.now()}` });
  record('R', `FIXTURE: pending invitation for an existing account (${r2}) → 201`, inv.status === 201, `${inv.status} ${JSON.stringify(inv.body?.error ?? '').slice(0, 160)}`);
  const invitationId = inv.body?.data?.id;
  // O6: a foreign number on Kavita Dairy (restored at the end)
  const kav = await must('GET', `/parties/${P.kavita}`, null, token);
  const kavMobile = kav.body.data.mobile;
  const foreign = await api('PATCH', `/parties/${P.kavita}`, { mobile: '+44 7700 900123' }, token);
  let kavStored = foreign.body?.data?.mobile ?? null;
  note(`PATCH Kavita mobile '+44 7700 900123' → ${foreign.status}, stored ${JSON.stringify(kavStored)} ${foreign.status >= 400 ? JSON.stringify(foreign.body?.error) : ''}`);
  if (foreign.status >= 400) {
    psql(`update parties_party set mobile='+44 7700 900123' where id='${P.kavita}'`);
    kavStored = '+44 7700 900123';
    note('FIXTURE (psql): the API refused a foreign mobile, so it was written directly');
  }

  try {
    // ═══ D1 focus return, keyboard only, desktop and phone ═══════════════
    for (const size of [DESKTOP, PHONE]) {
      ({ ctx, page } = await ownerSession(browser, state, { width: size.width, height: size.height }));
      await openKhata(page, P.ramesh, /Ramesh Traders/);
      const cases = [
        { item: 'Send reminder', close: 'Escape', target: 'Send reminder', tag: 'reminder-esc' },
        { item: 'Send reminder', close: 'X', target: 'Send reminder', tag: 'reminder-x' },
        { item: 'Archive', close: 'Escape', target: 'Archive', tag: 'archive-esc' },
        { item: 'Archive', close: 'X', target: 'Archive', tag: 'archive-x' },
        { item: 'Edit', close: 'Escape', target: 'Edit', tag: 'edit-esc' },
      ];
      for (const c of cases) {
        for (const pass of [1, 2]) {
          const r = await d1Flow(page, size.id, { ...c, pass });
          record('D1', `${size.id}: Ramesh (owes ₹2,300) ⋯ → ${c.item} → ${c.close === 'X' ? '✕' : 'Escape'} — focus back on ⋯ (pass ${pass}${pass === 2 ? ', cached chunk' : ''})`, r.ok, r.detail);
          if (!r.ok) {
            await page.screenshot({ path: rtShot(size.id, `D1-${c.tag}-FAIL-pass${pass}`) });
            while ((await dialogCount(page)) > 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
          }
        }
      }
      // "You gave" → Escape → back on "You gave"
      for (const pass of [1, 2]) {
        await page.evaluate(() => document.activeElement?.blur?.());
        const g = await tabTo(page, (f) => /^You gave/.test(f.text));
        if (!g) { record('D1', `${size.id}: Tab reaches "You gave"`, false, 'not reached'); break; }
        await page.evaluate(() => { window.__qaGave = document.activeElement; });
        await page.keyboard.press('Enter');
        await page.getByRole('dialog').last().waitFor({ timeout: 20000 });
        await page.waitForTimeout(800);
        if (pass === 1) await page.screenshot({ path: rtShot(size.id, 'D1-you-gave-open') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);
        const f = await focusInfo(page);
        record('D1', `${size.id}: "You gave" → Escape — focus back on "You gave" (pass ${pass})`, (await dialogCount(page)) === 0 && f.isGave, JSON.stringify(f));
      }
      // Add opening balance on a party WITHOUT one (Lakshmi Bakers)
      await openKhata(page, P.lakshmi, /Lakshmi Bakers/);
      for (const pass of [1, 2]) {
        const r = await d1Flow(page, size.id, { item: 'Add opening balance', close: 'Escape', target: 'opening balance', pass, tag: 'opening-esc' });
        record('D1', `${size.id}: Lakshmi (no opening balance) ⋯ → Add opening balance → Escape — focus back on ⋯ (pass ${pass})`, r.ok, r.detail);
        if (!r.ok) while ((await dialogCount(page)) > 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      }
      await ctx.close();
    }

    // ═══ D2 network failure → the reference is the request's X-Request-Id ═
    for (const size of [DESKTOP, PHONE]) {
      ({ ctx, page } = await ownerSession(browser, state, { width: size.width, height: size.height }));
      const sent = [];
      page.on('request', (r) => {
        if (/\/api\/v1\/parties/.test(r.url())) sent.push({ url: r.url().split('/api/v1')[1], id: r.headers()['x-request-id'] ?? null, method: r.method() });
      });
      await page.route(/\/api\/v1\/parties/, (route) => route.abort('failed'));
      await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByText('We could not load your customers').first().waitFor({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const errText = await page.locator('[data-testid="ub-grid"]').innerText().catch(() => '');
      await page.screenshot({ path: rtShot(size.id, 'D2-network-error-reference') });
      // The id is printed under "Try again", with or without a "Reference" label.
      const shown = /(?:Reference\s*[:·]?\s*)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})/i.exec(errText)?.[1] ?? null;
      const labelled = /Reference/i.test(errText);
      const snack = (await page.locator('[role="status"], [role="alert"]').allInnerTexts()).filter((t) => /could not reach/i.test(t));
      const snackId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})/i.exec(snack.join(' '))?.[1] ?? null;
      note(`${size.id}: error-state id=${shown} (labelled "Reference": ${labelled}); snackbar id=${snackId} belongs to ${JSON.stringify(sent.find((x) => x.id === snackId) ?? 'no /parties* request')}; all /parties* requests: ${JSON.stringify(sent)}`);
      const listReqs = sent.filter((s) => /^\/parties(\?|$)/.test(s.url) && s.method === 'GET');
      const last = listReqs[listReqs.length - 1];
      record('D2', `${size.id}: the network-failure error state shows a reference`, Boolean(shown), errText.replace(/\n/g, ' | ').slice(0, 300));
      record('D2', `${size.id}: the reference EQUALS the X-Request-Id the failed list request carried`, Boolean(shown) && shown === last?.id,
        `shown=${shown} lastListRequest=${JSON.stringify(last)} allListRequests=${JSON.stringify(listReqs.map((s) => s.id))}`);
      await ctx.close();
    }

    // ═══ D3 360 px, list 3 s slow → the loading state fits ═══════════════
    {
      ({ ctx, page } = await ownerSession(browser, state, { width: PHONE.width, height: PHONE.height }));
      await page.route(/\/api\/v1\/parties\?/, async (route) => { await sleep(3000); await route.continue(); });
      await page.goto(`${FRONTEND}/parties`, { waitUntil: 'commit', timeout: 120000 });
      const samples = [];
      for (let i = 0; i < 400 && samples.length < 4; i += 1) {
        const m = await page.evaluate(() => {
          const loading = document.querySelector('[data-testid="ub-stat-grid"] [aria-busy="true"], [data-testid="ub-grid"] [role="status"][aria-busy="true"]');
          if (!loading) return null;
          const bars = [...document.querySelectorAll('.animate-pulse')].filter((b) => b.getBoundingClientRect().width > 0);
          const bad = [];
          for (const b of bars) {
            const card = b.closest('.rounded-card') ?? b.closest('[aria-busy="true"]');
            if (!card) continue;
            const br = b.getBoundingClientRect();
            const cr = card.getBoundingClientRect();
            if (br.right > cr.right + 0.5 || br.width > cr.width + 0.5 || br.left < cr.left - 0.5) bad.push({ where: card.closest('[data-testid="ub-stat-grid"]') ? 'totals tile' : 'list card', cls: b.className.replace('animate-pulse rounded-sm bg-surface-sunken ', ''), bar: Math.round(br.width), card: Math.round(cr.width), overRight: Math.round(br.right - cr.right) });
          }
          return { scrollWidth: document.documentElement.scrollWidth, bars: bars.length, bad, statCards: document.querySelectorAll('[data-testid="ub-stat-grid"] [aria-busy="true"]').length, rowSkeleton: Boolean(document.querySelector('[data-testid="ub-grid"] [role="status"][aria-busy="true"]')) };
        }).catch(() => null);
        if (m) {
          samples.push(m);
          if (samples.length === 1) { await page.waitForTimeout(150); await page.screenshot({ path: rtShot('phone', 'D3-loading-360') }); }
          await page.waitForTimeout(300);
        } else await page.waitForTimeout(40);
      }
      record('D3', 'phone 360: the loading state was observed (list delayed 3 s)', samples.length > 0, JSON.stringify(samples.map((s) => ({ bars: s.bars, statCards: s.statCards, rowSkeleton: s.rowSkeleton }))));
      record('D3', 'phone 360: while loading, documentElement.scrollWidth <= 360 at every sample', samples.length > 0 && samples.every((s) => s.scrollWidth <= 360), JSON.stringify(samples.map((s) => s.scrollWidth)));
      record('D3', 'phone 360: no TOTALS-TILE skeleton bar wider than (or running past) its tile (the original D3)', samples.length > 0 && samples.every((s) => s.bad.every((b) => b.where !== 'totals tile')), JSON.stringify(samples.map((s) => s.bad.filter((b) => b.where === 'totals tile'))).slice(0, 400));
      const listBad = samples.flatMap((s) => s.bad.filter((b) => b.where === 'list card'));
      record('D3', 'phone 360: no LIST-ROW skeleton bar running past the list card', samples.length > 0 && listBad.length === 0, `${listBad.length} bars over, e.g. ${JSON.stringify(listBad.slice(0, 2))}`);
      await page.getByText('Ramesh Traders').first().waitFor({ timeout: 60000 }).catch(() => {});
      await ctx.close();
    }

    // ═══ D4 + O3 the team screen with a pending invitation ═══════════════
    for (const size of [SIZES[2], DESKTOP]) {
      ({ ctx, page } = await ownerSession(browser, state, { width: size.width, height: size.height }));
      await page.goto(`${FRONTEND}/settings/team`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByRole('button', { name: /^Revoke/ }).first().waitFor({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const shotDir = size.id === 'desktop' ? 'desktop' : 'desktop';
      await page.screenshot({ path: rtShot(shotDir, `D4-team-${size.width}`), fullPage: true });
      const m = await page.evaluate(() => {
        const tables = [...document.querySelectorAll('table')];
        const invT = tables.find((t) => [...t.querySelectorAll('button')].some((b) => /^Revoke/.test(b.innerText.trim())));
        const memT = tables.find((t) => t !== invT && [...t.querySelectorAll('th')].some((th) => th.textContent.trim() === 'Actions'));
        const btn = invT && [...invT.querySelectorAll('button')].find((b) => /^Revoke/.test(b.innerText.trim()));
        const td = btn?.closest('td');
        const truncated = btn ? [btn, ...btn.querySelectorAll('*')].filter((n) => n.scrollWidth > n.clientWidth + 1 || getComputedStyle(n).textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth).map((n) => ({ tag: n.tagName, sw: n.scrollWidth, cw: n.clientWidth, text: n.textContent.trim() })) : null;
        // an ancestor between the button and the cell that clips it
        const clippers = [];
        for (let n = btn?.parentElement; n && n !== td?.parentElement; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (n.scrollWidth > n.clientWidth + 1 && cs.overflow !== 'visible') clippers.push({ tag: n.tagName, sw: n.scrollWidth, cw: n.clientWidth, cls: n.className.toString().slice(0, 60) });
        }
        const thOf = (t) => t && [...t.querySelectorAll('th')].find((th) => th.textContent.trim() === 'Actions');
        const vis = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const inner = el.querySelector('*') ?? el;
          const ir = [...el.querySelectorAll('*')].map((k) => k.getBoundingClientRect()).filter((x) => x.width > 1 && x.height > 1);
          const cs = getComputedStyle(inner);
          const srOnly = [...el.querySelectorAll('*'), el].some((k) => k.classList?.contains('sr-only'));
          return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), srOnly, visibleText: el.innerText.trim(), clip: cs.clip };
        };
        const bR = btn?.getBoundingClientRect();
        const tR = td?.getBoundingClientRect();
        return {
          found: { inv: Boolean(invT), mem: Boolean(memT), btn: Boolean(btn) },
          button: btn ? { text: btn.innerText.trim(), width: Math.round(bR.width), left: Math.round(bR.left), right: Math.round(bR.right) } : null,
          cell: td ? { width: Math.round(tR.width), left: Math.round(tR.left), right: Math.round(tR.right) } : null,
          truncated, clippers,
          invHeader: vis(thOf(invT)), memHeader: vis(thOf(memT)),
          invTable: invT ? Math.round(invT.getBoundingClientRect().width) : null,
          memTable: memT ? Math.round(memT.getBoundingClientRect().width) : null,
        };
      });
      const tag = `${size.width}`;
      record('D4', `${tag}px: the invitations table and a Revoke button are present`, m.found.inv && m.found.btn, JSON.stringify(m.found));
      record('D4', `${tag}px: "Revoke" fully visible — reads "Revoke", nothing inside it truncated or clipped`,
        m.button?.text === 'Revoke' && (m.truncated ?? []).length === 0 && m.clippers.length === 0, JSON.stringify({ button: m.button, truncated: m.truncated, clippers: m.clippers }));
      record('D4', `${tag}px: button width <= cell width, and inside the cell`,
        Boolean(m.button && m.cell) && m.button.width <= m.cell.width && m.button.left >= m.cell.left && m.button.right <= m.cell.right, JSON.stringify({ button: m.button, cell: m.cell }));
      record('D4', `${tag}px: the invitations table shows a VISIBLE "Actions" header`, Boolean(m.invHeader) && m.invHeader.visibleText === 'Actions' && !m.invHeader.srOnly && m.invHeader.width > 1, JSON.stringify(m.invHeader));
      const dl = m.invHeader && m.memHeader ? Math.abs(m.invHeader.left - m.memHeader.left) : null;
      const dr = m.invHeader && m.memHeader ? Math.abs(m.invHeader.right - m.memHeader.right) : null;
      record('D4', `${tag}px: its "Actions" column lines up with the Members table's (left/right within 2 px)`, dl !== null && dl <= 2 && dr <= 2,
        `invitations th ${JSON.stringify(m.invHeader)} members th ${JSON.stringify(m.memHeader)} Δleft=${dl} Δright=${dr} tables ${m.invTable}/${m.memTable}`);
      // O3 heading
      const heading = await page.locator('main').innerText();
      const hm = /(\d+) people · (\d+) invited/.exec(heading);
      record('O3', `${tag}px: the Members heading reads "N people · M invited" (expect 3 people · 1 invited)`, Boolean(hm) && hm[1] === '3' && hm[2] === '1', hm?.[0] ?? heading.split('\n').slice(0, 12).join(' | '));
      await ctx.close();
    }
    // O3 at 360: the invited member card and the invitation card carry a mail icon
    {
      ({ ctx, page } = await ownerSession(browser, state, { width: PHONE.width, height: PHONE.height }));
      await page.goto(`${FRONTEND}/settings/team`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByText(r2).first().waitFor({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: rtShot('phone', 'O3-team-360'), fullPage: true });
      const cards = await page.evaluate((email) => {
        const sel = 'li, [role="listitem"], article, [role="row"], tr, [data-testid*="card"], [data-testid*="row"]';
        const all = [...document.querySelectorAll(sel)].filter((el) => el.textContent.includes(email));
        const minimal = all.filter((el) => ![...el.querySelectorAll(sel)].some((c) => c.textContent.includes(email)));
        return minimal.map((el) => {
          const discs = [...el.querySelectorAll('span.rounded-pill[aria-hidden="true"]')].filter((s) => /\bh-(7|10)\b/.test(s.className));
          return {
            text: el.innerText.replace(/\n/g, ' | ').slice(0, 120),
            discs: discs.map((d) => ({ text: d.innerText.trim(), mail: Boolean(d.querySelector('svg.lucide-mail')), svg: d.querySelector('svg')?.getAttribute('class') ?? null })),
          };
        });
      }, r2);
      const invitedCard = cards.find((c) => /Invited — has not joined yet/.test(c.text));
      const invitationCard = cards.find((c) => /Revoke|Waiting|Pending/.test(c.text));
      record('O3', 'phone 360: the INVITED MEMBER card shows a mail icon, not an email initial', Boolean(invitedCard) && invitedCard.discs.length > 0 && invitedCard.discs.every((d) => d.mail && d.text === ''), JSON.stringify(invitedCard ?? cards));
      record('O3', 'phone 360: the INVITATION card shows a mail icon, not an email initial', Boolean(invitationCard) && invitationCard.discs.length > 0 && invitationCard.discs.every((d) => d.mail && d.text === ''), JSON.stringify(invitationCard ?? cards));
      record('O3', 'phone 360: the team screen fits the viewport', (await overflowPx(page)) <= 0, `overflow ${await overflowPx(page)}px`);
      await ctx.close();
    }

    // ═══ O4 archived khata rows carry no ⋯ ═══════════════════════════════
    {
      ({ ctx, page } = await ownerSession(browser, state, { width: DESKTOP.width, height: DESKTOP.height }));
      const rowMenus = () => page.getByRole('button', { name: /^More actions for / }).count();
      await openKhata(page, P.sunita, /Sunita Tailors/);
      await page.getByText('Cash received').first().waitFor({ timeout: 30000 }).catch(() => {});
      const activeSunita = await rowMenus();
      record('O4', 'control — ACTIVE Sunita Tailors (2 entries): timeline rows have ⋯', activeSunita >= 2, `row ⋯ count=${activeSunita}`);
      await openKhata(page, P.ramesh, /Ramesh Traders/);
      await page.waitForTimeout(800);
      const activeRamesh = await rowMenus();
      note(`active Ramesh Traders (opening entry only): row ⋯ count=${activeRamesh}`);
      const arch = await api('POST', `/parties/${P.sunita}/archive`, { reason: 'QA retest O4' }, token, { 'Idempotency-Key': `rt-arch-${Date.now()}` });
      record('O4', 'FIXTURE: archive Sunita Tailors (balance 0) via API → 2xx', arch.status < 300, `${arch.status} ${JSON.stringify(arch.body?.error ?? '')}`);
      await openKhata(page, P.sunita, /Sunita Tailors/);
      await page.getByText('Cash received').first().waitFor({ timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(800);
      const entriesShown = await page.getByText(/Stitching thread|Cash received/).count();
      const archivedSunita = await rowMenus();
      await page.screenshot({ path: rtShot('desktop', 'O4-archived-sunita-no-row-menu'), fullPage: true });
      record('O4', 'ARCHIVED Sunita Tailors: entries are shown and no timeline row has ⋯', entriesShown >= 2 && archivedSunita === 0, `entries shown=${entriesShown} row ⋯=${archivedSunita}`);
      await openKhata(page, P.dinesh, /Dinesh Kirana/);
      await page.waitForTimeout(1200);
      const archivedDinesh = await rowMenus();
      record('O4', 'ARCHIVED Dinesh Kirana (opening entry): no timeline row has ⋯', archivedDinesh === 0, `row ⋯=${archivedDinesh}`);
      const rs = await api('POST', `/parties/${P.sunita}/restore`, {}, token, { 'Idempotency-Key': `rt-rest-${Date.now()}` });
      note(`FIXTURE restored: Sunita Tailors restore → ${rs.status}`);
      await ctx.close();
    }

    // ═══ O6 recipient line, English ═════════════════════════════════════
    {
      ({ ctx, page } = await ownerSession(browser, state, { width: DESKTOP.width, height: DESKTOP.height }));
      const cases = [
        ['ramesh', /Ramesh Traders/, 'To Ramesh Traders · +91 98123 45678', 'stored "09812345678"'],
        ['priya', /Priya Textiles/, 'To Priya Textiles · +91 98123 45679', 'stored "+91 98123 45679"'],
        ['kavita', /Kavita Dairy/, `To Kavita Dairy · ${kavStored}`, `foreign, stored ${JSON.stringify(kavStored)} → shown as stored`],
      ];
      for (const [key, name, expected, why] of cases) {
        await openKhata(page, P[key], name);
        const sheet = await openReminder(page);
        const s = await readSheet(sheet);
        await page.screenshot({ path: rtShot('desktop', `O6-recipient-${key}`) });
        record('O6', `${why}: recipient line reads "${expected}"`, s.description === expected, `${s.description} | wa=${s.waHref?.slice(0, 32)}`);
        await closeTopDialog(page);
      }
      await ctx.close();
    }

    // ═══ O5 Hindi: brand names in Latin, snackbar ═══════════════════════
    for (const size of [DESKTOP, PHONE]) {
      ({ ctx, page } = await ownerSession(browser, state, { width: size.width, height: size.height }, [{ name: 'ub_locale', value: 'hi', url: FRONTEND }]));
      await openKhata(page, P.ramesh, /Ramesh Traders/);
      const items = await menuItems(page);
      await page.getByRole('dialog').last().getByRole('button', { name: 'रिमाइंडर भेजें' }).click();
      const sheet = page.getByRole('dialog').last();
      await sheet.locator('[data-ub-share-preview]').waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      const labels = await sheet.evaluate((el) => {
        const links = [...el.querySelectorAll('a')];
        const wa = links.find((a) => a.href.startsWith('https://wa.me'));
        const sms = links.find((a) => a.href.startsWith('sms:'));
        return { wa: wa?.innerText.trim() ?? null, sms: sms?.innerText.trim() ?? null, waName: wa?.getAttribute('aria-label'), smsName: sms?.getAttribute('aria-label'), buttons: [...el.querySelectorAll('a,button')].map((b) => b.innerText.trim()).filter(Boolean), description: el.querySelector('[id$="-description"]')?.textContent ?? null };
      });
      await page.screenshot({ path: rtShot(size.id, 'O5-hindi-share-sheet') });
      record('O5', `${size.id} hi: the share sheet's buttons read "WhatsApp" and "SMS" in Latin`, labels.wa === 'WhatsApp' && labels.sms === 'SMS', JSON.stringify(labels));
      note(`${size.id} hi: menu=${JSON.stringify(items)} recipient line=${labels.description}`);
      const popupP = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
      await sheet.locator('a[href^="https://wa.me"]').click();
      const popup = await popupP;
      await page.waitForTimeout(1200);
      const snack = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
      await page.screenshot({ path: rtShot(size.id, 'O5-hindi-whatsapp-snackbar') });
      record('O5', `${size.id} hi: the snackbar after WhatsApp reads "WhatsApp खुल गया"`, snack.some((t) => t.trim() === 'WhatsApp खुल गया' || t.includes('WhatsApp खुल गया')), JSON.stringify(snack));
      if (popup) await popup.close();
      await ctx.close();
    }
  } finally {
    if (invitationId) {
      const rv = await api('DELETE', `/invitations/${invitationId}`, null, token);
      note(`FIXTURE restored: invitation for ${r2} revoked → ${rv.status}`);
    }
    const back = await api('PATCH', `/parties/${P.kavita}`, { mobile: kavMobile }, token);
    if (back.status >= 400) psql(`update parties_party set mobile='${kavMobile}' where id='${P.kavita}'`);
    note(`FIXTURE restored: Kavita Dairy mobile back to ${kavMobile} (${back.status})`);
  }
  const loginAfter = psql(`select coalesce(max(count),0)||' since '||coalesce(max(window_start)::text,'-') from platform_rate_limit where scope='login_ip'`);
  note(`logins spent by R this run: ${rtLogins}; login_ip after R: ${loginAfter}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// N — retest of 8ccd186 (backend) and 5d7b99e (frontend), `--only=N`
//
//   N1  NEW-1  cookie-expiry teardown: expired tenant-B session → one sign-in as A,
//              no stale-tab snackbar, no reload, B's name never rendered
//   N2  NEW-2  credit block + totals refresh after every ledger write
//   N3  NEW-3  statement / aging CSV filenames and "Due today" on the IST date
//   N4  NEW-4  failed-login-only IP budget. DESTRUCTIVE: runs only when named
//              explicitly (`--only=N4`) because it locks the IP login budget
//              for an hour; it deletes its own `login_ip_fail` row afterwards.
//
// `--only=N` runs N3, N1, N2. Sub-phases can be named individually.
// Screenshots: /tmp/e2e-shots/sprint3-qa/retest2/{phone,desktop}/.
// ═════════════════════════════════════════════════════════════════════════════
const N_DIR = `${SHOT_ROOT}/retest2`;
const N_STORAGE = `${N_DIR}/owner-storage.json`;
const N_STATE = `${N_DIR}/state.json`;
const nShot = (size, name) => `${N_DIR}/${size}/${name}.png`;
// The two retest accounts (R1 "Retest Budget Stores", R2 "Retest Browser
// Traders"). `run-regression.mjs` seeds a fresh pair per run with
// `lib/fixtures.mjs#seedRetestAccounts` and points this at them.
const RT_ACCOUNTS = process.env.E2E_RT_ACCOUNTS ?? '/tmp/claude-0/retest/state.json';
const RT_PASSWORD = 'Dukaan2026xRetest!';
const IST_DATE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // yyyy-mm-dd
const UTC_DATE = () => new Date().toISOString().slice(0, 10);
let nLogins = 0;

/** A browser session as `who`, reusing `storageFile` when it is still valid. */
const nSession = async (browser, who, viewport, storageFile) => {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...(storageFile && existsSync(storageFile) ? { storageState: storageFile } : {}) });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  let me = await whoAmI(page).catch(() => ({ email: null }));
  if (me.email !== who.email || page.url().includes('/login')) {
    nLogins += 1;
    note(`browser sign-in #${nLogins} this run (${who.email})`);
    await signIn(page, who);
    me = await whoAmI(page);
  }
  if (storageFile) {
    const saved = await ctx.storageState();
    saved.cookies = saved.cookies.filter((c) => c.name !== 'ub_locale');
    writeFileSync(storageFile, JSON.stringify(saved));
  }
  const token = (await ctx.cookies()).find((c) => c.name === 'ub_access')?.value ?? null;
  return { ctx, page, me, token };
};

/** Header balance, credit caption, bar, and the two "in all" totals, read off the screen. */
const khataFacts = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    const text = main?.innerText ?? '';
    const header = text.match(/(?:Customer|Supplier)[^\n]*\n(₹[\d,]+\.\d\d)/)?.[1] ?? null;
    const bar = [...document.querySelectorAll('[role="progressbar"]')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Credit used'));
    const captionMatch = text.match(/Credit used\s*\n+\s*([^\n]+)/);
    const captionEl = captionMatch ? [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && e.textContent.trim() === captionMatch[1].trim()) : null;
    const fill = bar ? [...bar.querySelectorAll('*')].find((e) => parseFloat(getComputedStyle(e).width) > 0 && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)') : null;
    return {
      header,
      caption: captionMatch?.[1]?.trim() ?? null,
      captionColor: captionEl ? getComputedStyle(captionEl).color : null,
      captionClass: captionEl?.className ?? null,
      barNow: bar?.getAttribute('aria-valuenow') ?? null,
      barLabel: bar?.getAttribute('aria-label') ?? null,
      fillWidth: fill ? fill.style.width || getComputedStyle(fill).width : null,
      fillColor: fill ? getComputedStyle(fill).backgroundColor : null,
      gaveAll: text.match(/You gave in all\n(₹[\d,]+\.\d\d)/)?.[1] ?? null,
      gotAll: text.match(/You got in all\n(₹[\d,]+\.\d\d)/)?.[1] ?? null,
      rows: [...document.querySelectorAll('main button')].filter((b) => /^More actions for /.test(b.getAttribute('aria-label') ?? b.textContent.trim())).length,
      scrollY: Math.round(window.scrollY),
    };
  });

/** Post "You gave"/"You got" through the drawer; returns the backend requests seen in `windowMs` after Save. */
const postViaDrawer = async (page, which, amount, noteText, { windowMs = 3500, wait = true, noScroll = false } = {}) => {
  // noScroll: press the button without Playwright's scroll-into-view, so the
  // page's own scroll position is what the app leaves it at.
  if (noScroll) await page.getByRole('button', { name: which }).first().evaluate((el) => el.click());
  else await page.getByRole('button', { name: which }).first().click();
  await page.waitForSelector('role=dialog', { timeout: 15000 });
  await page.waitForTimeout(500);
  const field = page.getByLabel('Amount');
  await field.fill(amount);
  if (noteText) await page.getByLabel(/^Note/).fill(noteText);
  const reqs = [];
  const onReq = (r) => { if (r.url().startsWith(BACKEND)) reqs.push({ t: Date.now(), m: r.method(), u: r.url().replace(BACKEND, '').replace(/\?.*/, (q) => q.slice(0, 60)) }); };
  page.on('request', onReq);
  const t0 = Date.now();
  await page.evaluate(() => { window.__saveAt = window.__hdrT0 ? Math.round(performance.now() - window.__hdrT0) : null; });
  await page.getByRole('button', { name: 'Save' }).click();
  if (wait) await page.waitForTimeout(windowMs);
  page.off('request', onReq);
  return { t0, reqs: reqs.map((r) => `+${r.t - t0}ms ${r.m} ${r.u}`) };
};

// ─── N3 ──────────────────────────────────────────────────────────────────────
async function phaseN3(browser, state, token) {
  const P = state.parties;
  const ist = IST_DATE(); const utc = UTC_DATE();
  const inWindow = ist !== utc;
  note(`N3: now ${new Date().toISOString()} — UTC date ${utc}, IST date ${ist} (${inWindow ? 'INSIDE' : 'outside'} the 18:30–24:00 UTC window)`);
  if (!inWindow) {
    record('N3', 'outside the window — the UTC and IST dates agree, so the live check cannot tell them apart; run the backend tests instead', true, 'pytest apps/ledger/tests/test_statement.py apps/parties/tests/test_list_filters.py');
    return;
  }
  // Fixtures: Vijay due on the IST date, Sunita (₹0) and Kavita (₹300) due on the UTC date, Lakshmi tomorrow (IST).
  const tomorrowIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86_400_000));
  const fix = { vijay: ist, sunita: utc, kavita: utc, lakshmi: tomorrowIst };
  for (const [k, d] of Object.entries(fix)) await must('PATCH', `/parties/${P[k]}`, { collection_date: d }, token);
  note(`FIXTURE (API): collection_date Vijay=${ist} (IST today), Sunita=${utc} & Kavita=${utc} (UTC today = IST yesterday), Lakshmi=${tomorrowIst}`);
  try {
    for (const c of ['today', 'overdue', 'upcoming']) {
      const r = await must('GET', `/parties?collection=${c}`, null, token);
      note(`API /parties?collection=${c} → ${JSON.stringify(r.body.data.map((p) => p.name))}`);
      if (c === 'today') record('N3', `API "Due today" = the party due on the IST date only (${ist})`, r.body.data.length === 1 && r.body.data[0].name === 'Vijay Medical', JSON.stringify(r.body.data.map((p) => p.name)));
      if (c === 'overdue') record('N3', `API "Overdue" includes the party due on the UTC date (${utc} = IST yesterday) who owes money`, r.body.data.some((p) => p.name === 'Kavita Dairy') && !r.body.data.some((p) => p.name === 'Vijay Medical'), JSON.stringify(r.body.data.map((p) => p.name)));
      if (c === 'upcoming') record('N3', `API "Upcoming" includes IST-tomorrow (${tomorrowIst}), not IST-today`, r.body.data.some((p) => p.name === 'Lakshmi Bakers') && !r.body.data.some((p) => p.name === 'Vijay Medical'), JSON.stringify(r.body.data.map((p) => p.name)));
    }
    for (const size of [DESKTOP, PHONE]) {
      const { ctx, page } = await nSession(browser, state.owner, { width: size.width, height: size.height }, N_STORAGE);
      // Statement CSV
      await page.goto(`${FRONTEND}/parties/${P.ramesh}/statement`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.locator('a[href*="format=csv"]').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(800);
      let dl = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('a[href*="format=csv"]').first().click();
      let name = (await dl).suggestedFilename();
      await page.screenshot({ path: nShot(size.id, 'N3-statement') });
      record('N3', `${size.id}: statement CSV downloaded from the UI is named for the IST date`, name === `statement-${P.ramesh}-${ist}.csv`, `${name} (UTC date ${utc})`);
      // Aging CSV
      await page.goto(`${FRONTEND}/ledger/aging`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.locator('a[href*="format=csv"]').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(800);
      dl = page.waitForEvent('download', { timeout: 30000 });
      await page.locator('a[href*="format=csv"]').first().click();
      name = (await dl).suggestedFilename();
      await page.screenshot({ path: nShot(size.id, 'N3-aging') });
      record('N3', `${size.id}: aging CSV downloaded from the UI is named for the IST date`, name === `aging-receivable-${ist}.csv`, `${name} (UTC date ${utc})`);
      // Due today chip
      await page.goto(`${FRONTEND}/parties?collection=today`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByText('Vijay Medical').first().waitFor({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const body = await page.locator('main').innerText();
      await page.screenshot({ path: nShot(size.id, 'N3-due-today'), fullPage: true });
      record('N3', `${size.id}: /parties?collection=today lists Vijay Medical (due ${ist}) and not Sunita/Kavita (due ${utc})`, body.includes('Vijay Medical') && !body.includes('Sunita Tailors') && !body.includes('Kavita Dairy'), body.replace(/\s+/g, ' ').slice(0, 300));
      await ctx.close();
    }
  } finally {
    for (const k of Object.keys(fix)) await api('PATCH', `/parties/${P[k]}`, { collection_date: null }, token);
    note('FIXTURE restored: collection_date back to null on Vijay, Sunita, Kavita, Lakshmi');
  }
}

// ─── N1 ──────────────────────────────────────────────────────────────────────
const B_NAMES = ['Retest Browser Traders', 'Smoke Party', 'Upi Party', 'Naidu Suppliers', 'Race Supplier', 'Rao Customer', 'Zero Smoke'];
async function phaseN1(browser, state) {
  const rt = JSON.parse(readFileSync(RT_ACCOUNTS, 'utf8'));
  const tenantB = { email: rt.R2.email, password: RT_PASSWORD };
  // Tenant A must be an ONBOARDED business: the sprint3 owner's tenant is still at
  // onboarding_step 1 (seeded through the API), so any sign-in there lands on
  // /onboarding by design. R1's "Retest Budget Stores" finished onboarding.
  const tenantA = { email: rt.R1.email, password: RT_PASSWORD, shop: 'Retest Budget Stores' };
  // /dashboard is a redirect to /parties until RPT-01 (app/(app)/dashboard/page.tsx).
  const landed = (u) => ['/dashboard', '/parties'].includes(new URL(u).pathname);
  for (const size of [DESKTOP, PHONE]) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    let armed = false; const leaks = []; const snacks = []; let docLoads = 0; const docUrls = [];
    await ctx.exposeBinding('__nLeak', (_s, n, where) => { if (armed) leaks.push({ n, where }); });
    await ctx.exposeBinding('__nSnack', (_s, t) => { if (armed) snacks.push(t); });
    await ctx.exposeBinding('__nDoc', (_s, where) => { docLoads += 1; docUrls.push(where); });
    await ctx.addInitScript((names) => {
      window.__nDoc(`${location.pathname}${location.search}`);
      const start = () => {
        const scan = (node) => {
          const t = node.textContent || '';
          for (const n of names) if (t.includes(n)) window.__nLeak(n, `${location.pathname}${location.search} :: ${(node.nodeType === 1 ? node.outerHTML : node.parentElement?.outerHTML || '').replace(/\s+/g, ' ').slice(0, 200)}`);
          if (/another tab/i.test(t)) window.__nSnack(t.trim().slice(0, 120));
        };
        scan(document.body);
        new MutationObserver((ms) => { for (const m of ms) { m.addedNodes.forEach(scan); if (m.type === 'characterData') scan(m.target); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
      };
      if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    }, B_NAMES);
    const page = await ctx.newPage();
    const navs = []; const net = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(FRONTEND, '')); });
    page.on('response', (r) => { if (r.url().startsWith(BACKEND)) net.push(`${r.request().method()} ${r.url().replace(BACKEND, '')} ${r.status()}`); });
    nLogins += 1;
    await signIn(page, tenantB);
    await page.goto(`${FRONTEND}/ledger/aging`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText('Upi Party').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    const shellB = await page.getByText('Retest Browser Traders').count();
    await page.screenshot({ path: nShot(size.id, 'N1-0-tenantB-aging') });
    record('N1', `${size.id}: signed in as tenant B (${tenantB.email}), aging shows B's parties and B's name in the shell`, shellB > 0, `B name nodes: ${shellB}`);
    await ctx.clearCookies({ name: 'ub_access' });
    await ctx.clearCookies({ name: 'ub_refresh' });
    const l0 = docLoads; const v0 = navs.length; const n0 = net.length;
    // Customers link (Dashboard was removed from the sidebar in the UAT-fix
    // batch) — on the phone it sits in the navigation drawer.
    let dash = page.getByRole('link', { name: /^Customers/ }).filter({ visible: true });
    if ((await dash.count()) === 0) {
      const menu = page.getByRole('button', { name: /menu|navigation/i }).first();
      if (await menu.count()) { await menu.click(); await page.waitForTimeout(600); }
      dash = page.getByRole('link', { name: /^Customers/ }).filter({ visible: true });
    }
    armed = true;
    await dash.first().click();
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const loginUrl = page.url().replace(FRONTEND, '');
    await page.screenshot({ path: nShot(size.id, 'N1-1-login-after-expiry') });
    record('N1', `${size.id}: cookies deleted, Customers click → /login?next=%2Fparties in the same runtime`, loginUrl === '/login?next=%2Fparties' && docLoads === l0, `${loginUrl} docLoads+${docLoads - l0} navs=${JSON.stringify(navs.slice(v0))}`);
    // One sign-in as tenant A, slowed tenant reads so any stale frame is held on screen.
    await ctx.route(/\/api\/v1\/(ledger\/summary|ledger\/aging|parties(\?|$))/, async (route) => { await sleep(1500); await route.continue(); });
    const l1 = docLoads; const v1 = navs.length; const n1 = net.length;
    nLogins += 1;
    await page.fill('input[type="email"]', tenantA.email);
    await page.fill('input[type="password"]', tenantA.password);
    const tSubmit = Date.now();
    await page.click('button[type="submit"]');
    for (let k = 0; k < 20; k += 1) { await page.screenshot({ path: nShot(size.id, `N1-2-flash-${String(k).padStart(2, '0')}`) }).catch(() => {}); await page.waitForTimeout(100); }
    await page.getByText(tenantA.shop).filter({ visible: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
    const landedMs = Date.now() - tSubmit;
    await page.waitForTimeout(3000);
    const me = await whoAmI(page);
    const shellA = await page.getByText(tenantA.shop).count();
    await page.screenshot({ path: nShot(size.id, 'N1-3-landed-as-A') });
    const loginPosts = net.slice(n1).filter((x) => x.startsWith('POST /auth/login')).length;
    record('N1', `${size.id}: ONE sign-in as tenant A (${tenantA.email}) lands on /dashboard (→ /parties) as A`, landed(page.url()) && me.email === tenantA.email && shellA > 0 && loginPosts === 1,
      `url=${page.url().replace(FRONTEND, '')} me=${me.email} shellA=${shellA} POST /auth/login×${loginPosts} ~${landedMs}ms navs=${JSON.stringify(navs.slice(v1))}`);
    record('N1', `${size.id}: no "switched in another tab" snackbar`, snacks.length === 0, JSON.stringify(snacks));
    /* N1-P1 (fix of this phase's own finding): expiry → /login stays in the
       same JS runtime (asserted above, and again here as l1 === l0), but the
       sign-in that follows an earlier session in the same document now ends
       in ONE document load of the destination. A client navigation there read
       Next's route cache, which had learned "/dashboard IS /login?next=…" from
       the proxy's redirect while the cookies were gone, and never left /login
       on a phone. What this check guards against is still what it was written
       for: a reload BACK TO /login (the old stale-tab bounce) or a second one. */
    const docsAfterSubmit = docUrls.slice(l1);
    record('N1', `${size.id}: no reload between expiry and sign-in; the sign-in ends in exactly one document load, of the destination (never /login)`,
      l1 === l0 && docsAfterSubmit.length === 1 && landed(`${FRONTEND}${docsAfterSubmit[0]}`),
      `docLoads before submit +${l1 - l0}, after submit ${JSON.stringify(docsAfterSubmit)}`);
    record('N1', `${size.id}: tenant B's name and parties never rendered after expiry (MutationObserver across navigations)`, leaks.length === 0, JSON.stringify(leaks.slice(0, 3)));
    note(`${size.id}: network after submit: ${JSON.stringify(net.slice(n1).slice(0, 25))}`);
    note(`${size.id}: network between expiry and submit: ${JSON.stringify(net.slice(n0, n1))}`);
    await ctx.close();
  }

  // ── Control: a genuinely stale tab is still caught ──────────────────────
  {
    const inviteeRef = state.invitee;
    const ctx = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height } });
    let docLoads = 0; const snacks = [];
    await ctx.exposeBinding('__nDoc', (src) => { if (src.page === tab1) docLoads += 1; });
    await ctx.exposeBinding('__nSnack', (src, t) => { if (src.page === tab1) snacks.push(t); });
    await ctx.addInitScript(() => {
      window.__nDoc();
      const start = () => new MutationObserver(() => { const t = document.body.innerText; if (/another tab/i.test(t)) window.__nSnack(t.match(/[^\n]*another tab[^\n]*/i)[0]); }).observe(document.body, { childList: true, subtree: true, characterData: true });
      if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    });
    const tab1 = await ctx.newPage();
    nLogins += 1;
    await signIn(tab1, inviteeRef);
    if (tab1.url().includes('/switch')) {
      await tab1.getByText(state.inviteeShop).first().click();
      await tab1.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 30000 });
    }
    // Starts on Aging so the sidebar Customers click below is a real navigation
    // that fetches (Dashboard, the old trigger, left the sidebar in the UAT-fix
    // batch; Customers clicked while already on /parties fetches nothing).
    await tab1.goto(`${FRONTEND}/ledger/aging`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await tab1.waitForTimeout(3000);
    const meBefore = await whoAmI(tab1);
    const activeBefore = meBefore.data?.tenant?.name ?? meBefore.data?.active_tenant?.name ?? JSON.stringify(meBefore.data?.tenant ?? meBefore.data?.membership ?? '').slice(0, 80);
    const tab2 = await ctx.newPage();
    await tab2.goto(`${FRONTEND}/switch`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await tab2.waitForTimeout(2500);
    const other = (await tab2.locator('main').innerText()).includes(state.shop) ? state.shop : state.inviteeShop;
    const target = activeBefore && String(activeBefore).includes(state.shop) ? state.inviteeShop : state.shop;
    await tab2.screenshot({ path: nShot('desktop', 'N1-4-control-tab2-switch') });
    await tab2.getByText(target).first().click();
    await tab2.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 30000 }).catch(() => {});
    await tab2.waitForTimeout(2000);
    const l0 = docLoads;
    await tab1.bringToFront();
    // tab 1's next request carries the new tenant — trigger one the way a merchant would
    await tab1.getByRole('link', { name: /^Customers/ }).first().click().catch(() => {});
    await tab1.waitForTimeout(400);
    await tab1.screenshot({ path: nShot('desktop', 'N1-5-control-tab1-warning') });
    await tab1.waitForTimeout(3000);
    record('N1', `control: switching business in tab 2 (→ ${target}) still warns in tab 1 and reloads it`, snacks.length > 0 && docLoads > l0, `snacks=${JSON.stringify([...new Set(snacks)])} tab1 reloads=${docLoads - l0} (was: ${activeBefore}; other-option-visible=${other})`);
    await ctx.close();
  }

  // ── A signed-in user opening /login deliberately ────────────────────────
  {
    const { ctx, page } = await nSession(browser, state.owner, { width: DESKTOP.width, height: DESKTOP.height }, N_STORAGE);
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    // Client-side navigation to /login (same JS runtime): push via history + popstate is not Next's router, so click a link if one exists, else use the Next router global.
    const viaRouter = await page.evaluate(() => { const r = window.next?.router; if (r?.push) { r.push('/login'); return 'next.router.push'; } return null; });
    if (!viaRouter) await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const urlAfter = page.url().replace(FRONTEND, '');
    const shellAfter = await page.getByText(state.shop).count();
    const formShown = await page.locator('input[type="email"]').count();
    await page.screenshot({ path: nShot('desktop', 'N1-6-deliberate-login') });
    record('N1', 'signed-in user opening /login: the login form is shown and the shell no longer shows their business (signed out in that tab)', formShown > 0 && shellAfter === 0, `${viaRouter ?? 'page.goto'} → ${urlAfter} form=${formShown} shopNodes=${shellAfter}`);
    const cookiesKept = (await ctx.cookies()).filter((c) => c.name.startsWith('ub_')).map((c) => c.name);
    await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(3000);
    const me = await whoAmI(page);
    await page.screenshot({ path: nShot('desktop', 'N1-7-hard-reload-restores') });
    record('N1', 'a hard load of /dashboard afterwards restores the session (cookies were not revoked)', ['/dashboard', '/parties'].includes(new URL(page.url()).pathname) && me.email === state.owner.email && (await page.getByText(state.shop).count()) > 0, `url=${page.url().replace(FRONTEND, '')} me=${me.email} cookies=${JSON.stringify(cookiesKept)}`);
    await ctx.close();
  }
}

// ─── N2 ──────────────────────────────────────────────────────────────────────
async function phaseN2(browser, state, token) {
  const stamp = Date.now();
  const today = IST_DATE();
  const mk = async (name, limit, entries) => {
    const p = await must('POST', '/parties', { name, is_customer: true, is_supplier: false, ...(limit ? { credit_limit: limit, credit_days: 30 } : {}) }, token, { 'Idempotency-Key': `n2-${stamp}-${name}` });
    const id = p.body.data.id;
    for (const [i, [amount, noteText, dir]] of entries.entries()) {
      await must('POST', `/parties/${id}/ledger-entries`, { entry_date: today, direction: dir ?? 'debit', amount, note: noteText }, token, { 'Idempotency-Key': `n2-${stamp}-${name}-${i}` });
    }
    return id;
  };
  const tag = String(stamp).slice(-4);
  const over = await mk(`QA Over Limit ${tag}`, '1000.00', [['1000.00', 'Wholesale rice'], ['250.00', 'Sugar sacks']]);
  const near = await mk(`QA Near Limit ${tag}`, '1000.00', [['500.00', 'Atta bags']]);
  const long = await mk(`QA Long Khata ${tag}`, '100000.00', Array.from({ length: 62 }, (_, i) => [`${10 + i}.00`, `Item ${String(i + 1).padStart(2, '0')}`]));
  note(`FIXTURE (API): QA Over Limit ${tag} (₹1,000 limit, ₹1,250 owed: Wholesale rice ₹1,000 + Sugar sacks ₹250), QA Near Limit ${tag} (₹500 of ₹1,000), QA Long Khata ${tag} (62 entries)`);
  const reqCounts = [];

  for (const size of [DESKTOP, PHONE]) {
    const { ctx, page } = await nSession(browser, state.owner, { width: size.width, height: size.height }, N_STORAGE);
    if (size.id === 'phone') {
      // Phone: the headline flow once more on a fresh ₹1,250 party.
      const overP = await mk(`QA Over Phone ${tag}`, '1000.00', [['1250.00', 'Opening stock']]);
      await openKhata(page, overP, /QA Over Phone/);
      const b = await khataFacts(page);
      await page.screenshot({ path: nShot('phone', 'N2-0-over-before'), fullPage: true });
      const { reqs } = await postViaDrawer(page, /You gave/, '200', 'Phone check');
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('phone', 'N2-1-over-after-200'), fullPage: true });
      record('N2', 'phone: You gave ₹200 on ₹1,250/₹1,000 → caption "₹450.00 over the ₹1,000.00 limit", total +₹200, header ₹1,450.00, no reload', a.caption === '₹450.00 over the ₹1,000.00 limit' && a.gaveAll === '₹1,450.00' && a.header === '₹1,450.00', `before=${JSON.stringify(b)} after=${JSON.stringify(a)}`);
      reqCounts.push({ where: 'phone gave 200', reqs });
      // Phone long khata: the merchant's own tap (Playwright scrolls only if the button is off-screen).
      await openKhata(page, long, /QA Long Khata/);
      for (let k = 0; k < 3 && (await page.getByRole('button', { name: 'Show older entries' }).count()) > 0; k += 1) {
        await page.getByRole('button', { name: 'Show older entries' }).first().click();
        await page.waitForTimeout(1500);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(800);
      const lb = await khataFacts(page);
      const inViewP = await page.getByRole('button', { name: /You gave/ }).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
      await page.screenshot({ path: nShot('phone', 'N2-7-long-before') });
      await postViaDrawer(page, /You gave/, '5', 'Phone scrolled post', { noScroll: true });
      const la = await khataFacts(page);
      await page.screenshot({ path: nShot('phone', 'N2-8-long-after') });
      record('N2', `phone long khata: rows kept +1 (${lb.rows} → ${la.rows}) and scroll kept (${lb.scrollY} → ${la.scrollY})`, lb.rows > 50 && la.rows === lb.rows + 1 && Math.abs(la.scrollY - lb.scrollY) < 400, `You-gave in viewport when scrolled to the bottom: ${inViewP}`);
      await ctx.close();
      continue;
    }
    let docLoads = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) docLoads += 1; });

    // ── ₹250 over → You gave ₹200 → ₹450 over ────────────────────────────
    await openKhata(page, over, /QA Over Limit/);
    const b0 = await khataFacts(page);
    await page.screenshot({ path: nShot('desktop', 'N2-0-over-before'), fullPage: true });
    record('N2', 'fixture reads "₹250.00 over the ₹1,000.00 limit", header ₹1,250.00', b0.caption === '₹250.00 over the ₹1,000.00 limit' && b0.header === '₹1,250.00', JSON.stringify(b0));
    const nav0 = docLoads;
    // Sample the header every 50 ms from Save to prove it moves instantly.
    await page.evaluate(() => { window.__hdr = []; const t0 = performance.now(); window.__hdrT0 = t0; window.__hdrT = setInterval(() => { const m = document.querySelector('main')?.innerText.match(/(?:Customer|Supplier)[^\n]*\n(₹[\d,]+\.\d\d)/); const c = document.querySelector('main')?.innerText.match(/Credit used\s*\n+\s*([^\n]+)/); window.__hdr.push([Math.round(performance.now() - t0), m?.[1] ?? null, c?.[1] ?? null]); }, 50); });
    const s1 = await postViaDrawer(page, /You gave/, '200', 'Oil tins');
    const [hdr1, saveAt] = await page.evaluate(() => { clearInterval(window.__hdrT); return [window.__hdr, window.__saveAt]; });
    const a1 = await khataFacts(page);
    await page.screenshot({ path: nShot('desktop', 'N2-1-over-after-200'), fullPage: true });
    const firstHeader = hdr1.find((h) => h[1] === '₹1,450.00');
    const firstCaption = hdr1.find((h) => h[2] === '₹450.00 over the ₹1,000.00 limit');
    const saveClickAt = hdr1.length ? hdr1[0][0] : 0;
    record('N2', 'You gave ₹200 → caption "₹450.00 over the ₹1,000.00 limit" without reload', a1.caption === '₹450.00 over the ₹1,000.00 limit' && docLoads === nav0, `${JSON.stringify(a1)} navigations=${docLoads - nav0}`);
    // The track is full at 100 % and over; what moves over the limit is the bar's accessible name. The fill is asserted moving in the reverse/correct/near checks.
    record('N2', 'the bar updates (full track, accessible name follows to ₹450.00 over)', (b0.barLabel ?? '').includes('₹250.00 over') && (a1.barLabel ?? '').includes('₹450.00 over') && a1.barNow === '100', `before ${b0.barNow} "${b0.barLabel}" fill ${b0.fillWidth} → after ${a1.barNow} "${a1.barLabel}" fill ${a1.fillWidth}`);
    record('N2', '"You gave in all" rises by ₹200 (₹1,250.00 → ₹1,450.00)', b0.gaveAll === '₹1,250.00' && a1.gaveAll === '₹1,450.00', `${b0.gaveAll} → ${a1.gaveAll}`);
    record('N2', 'header balance moved instantly (on the POST, no later than the caption refetch)', Boolean(firstHeader) && (!firstCaption || firstHeader[0] <= firstCaption[0]) && firstHeader[0] - saveAt < 1000, `Save clicked at ${saveAt}ms; header ₹1,450.00 first sampled at ${firstHeader?.[0]}ms (+${firstHeader?.[0] - saveAt}ms), caption ₹450.00-over at ${firstCaption?.[0]}ms (+${firstCaption?.[0] - saveAt}ms)`);
    reqCounts.push({ where: 'desktop gave 200 (over-limit party)', reqs: s1.reqs });

    // ── Reverse "Sugar sacks" (₹250) → ₹1,200 → "₹200.00 over" ───────────
    {
      const reqs = []; const onReq = (r) => { if (r.url().startsWith(BACKEND)) reqs.push(`${r.request ? '' : ''}${r.method()} ${r.url().replace(BACKEND, '').slice(0, 90)}`); };
      await page.getByRole('button', { name: 'More actions for Sugar sacks' }).first().click();
      await page.getByRole('button', { name: 'Reverse this entry' }).click();
      await page.getByLabel('Reason').fill('Returned unopened');
      page.on('request', onReq);
      await page.getByRole('button', { name: 'Reverse entry' }).click();
      await page.waitForTimeout(3500);
      page.off('request', onReq);
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-2-after-reverse'), fullPage: true });
      record('N2', 'reverse ₹250 → caption "₹200.00 over the ₹1,000.00 limit", header ₹1,200.00, You gave in all ₹1,200.00', a.caption === '₹200.00 over the ₹1,000.00 limit' && a.header === '₹1,200.00' && a.gaveAll === '₹1,200.00', JSON.stringify(a));
      reqCounts.push({ where: 'desktop reverse', reqs });
    }
    // ── Correct "Wholesale rice" ₹1,000 → ₹700 → ₹900 → "₹100.00 left" ─────
    {
      const reqs = []; const onReq = (r) => { if (r.url().startsWith(BACKEND)) reqs.push(`${r.method()} ${r.url().replace(BACKEND, '').slice(0, 90)}`); };
      await page.getByRole('button', { name: 'More actions for Wholesale rice' }).first().click();
      await page.getByRole('button', { name: 'Correct this entry' }).click();
      await page.waitForSelector('role=dialog', { timeout: 15000 });
      await page.waitForTimeout(500);
      await page.getByLabel('Amount').fill('700');
      await page.getByLabel('Reason').fill('Billed 10 bags, delivered 7');
      page.on('request', onReq);
      await page.getByRole('button', { name: 'Save correction' }).click();
      await page.waitForTimeout(3500);
      page.off('request', onReq);
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-3-after-correct'), fullPage: true });
      record('N2', 'correct ₹1,000 → ₹700 → caption "₹100.00 left of ₹1,000.00", header ₹900.00, You gave in all ₹900.00', a.caption === '₹100.00 left of ₹1,000.00' && a.header === '₹900.00' && a.gaveAll === '₹900.00', JSON.stringify(a));
      reqCounts.push({ where: 'desktop correct', reqs });
    }
    // ── Two quick entries: header never goes backwards ────────────────────
    {
      // Slow the party-detail and timeline reads so the first write's refetch is still in flight when the second lands.
      await page.route(new RegExp(`/api/v1/parties/${over}(\\?|$)|/api/v1/parties/${over}/ledger-entries\\?`), async (route) => { if (route.request().method() === 'GET') await sleep(1200); await route.continue(); });
      await page.evaluate(() => { window.__hdr = []; const t0 = performance.now(); window.__hdrT = setInterval(() => { const m = document.querySelector('main')?.innerText.match(/(?:Customer|Supplier)[^\n]*\n(₹[\d,]+\.\d\d)/); window.__hdr.push([Math.round(performance.now() - t0), m?.[1] ?? null]); }, 50); });
      const q1 = await postViaDrawer(page, /You gave/, '10', 'Matchbox', { wait: false });
      await page.waitForSelector('role=dialog', { state: 'detached', timeout: 15000 }).catch(() => {});
      const q2 = await postViaDrawer(page, /You gave/, '20', 'Candles', { windowMs: 5000 });
      const hdr = await page.evaluate(() => { clearInterval(window.__hdrT); return window.__hdr; });
      await page.unroute(new RegExp(`/api/v1/parties/${over}(\\?|$)|/api/v1/parties/${over}/ledger-entries\\?`));
      const seq = hdr.map((h) => h[1]).filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
      const at930 = hdr.findIndex((h) => h[1] === '₹930.00');
      const backwards = at930 >= 0 && hdr.slice(at930).some((h) => h[1] !== '₹930.00');
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-4-after-two-quick'), fullPage: true });
      record('N2', 'two entries saved quickly (₹10 then ₹20, reads slowed 1.2 s): header sampled every 50 ms never shows ₹910.00 after ₹930.00', !backwards && a.header === '₹930.00', `distinct header sequence ${JSON.stringify(seq)} over ${hdr.length} samples; gap between saves ${q2.t0 - q1.t0}ms; final ${JSON.stringify(a)}`);
      reqCounts.push({ where: 'desktop quick pair (2nd save, 5 s window)', reqs: q2.reqs });
    }
    // ── Archive with write-off → nothing used ─────────────────────────────
    {
      await page.getByRole('button', { name: 'More actions', exact: true }).first().click();
      await page.getByRole('button', { name: 'Archive' }).last().click();
      const dialog = page.getByRole('dialog').last();
      await dialog.getByRole('button', { name: 'Archive' }).click();
      await dialog.getByText(/still owes you/).waitFor({ timeout: 30000 });
      await dialog.getByRole('button', { name: /^Write off ₹/ }).click();
      await dialog.getByLabel('Why are you writing this off?').fill('Shop closed');
      await dialog.getByLabel('I understand this money is written off').click();
      const reqs = []; const onReq = (r) => { if (r.url().startsWith(BACKEND)) reqs.push(`${r.method()} ${r.url().replace(BACKEND, '').slice(0, 90)}`); };
      page.on('request', onReq);
      await dialog.getByRole('button', { name: 'Write off and archive' }).click();
      await page.getByText('This party is archived').waitFor({ timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3500);
      page.off('request', onReq);
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-5-after-writeoff'), fullPage: true });
      const api0 = await must('GET', `/parties/${over}`, null, token);
      record('N2', 'archive with write-off → credit block shows nothing used (caption "₹1,000.00 left of ₹1,000.00" or no bar), header ₹0.00', (a.caption === null || a.caption === '₹1,000.00 left of ₹1,000.00') && (a.barNow === null || a.barNow === '0') && a.header === '₹0.00', `${JSON.stringify(a)} server credit=${JSON.stringify(api0.body.data.credit)}`);
      reqCounts.push({ where: 'desktop write-off+archive', reqs });
    }
    // ── ₹500 of ₹1,000 → You gave ₹250 → "₹250.00 left", amber ────────────
    {
      await openKhata(page, near, /QA Near Limit/);
      const b = await khataFacts(page);
      const s = await postViaDrawer(page, /You gave/, '250', 'Ghee tins');
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-6-near-after-250'), fullPage: true });
      record('N2', '₹500 → You gave ₹250 → "₹250.00 left of ₹1,000.00", amber (text-warning caption, amber fill), header ₹750.00, fill 50% → 75%', a.caption === '₹250.00 left of ₹1,000.00' && a.header === '₹750.00' && /text-warning/.test(a.captionClass ?? '') && a.fillColor === a.captionColor && b.fillWidth === '50%' && a.fillWidth === '75%', `before ${JSON.stringify(b)} after ${JSON.stringify(a)}`);
      reqCounts.push({ where: 'desktop gave 250 (near party)', reqs: s.reqs });
    }
    // ── Long khata: scroll past 50 rows, post, position kept ──────────────
    {
      await openKhata(page, long, /QA Long Khata/);
      for (let k = 0; k < 3 && (await page.getByRole('button', { name: 'Show older entries' }).count()) > 0; k += 1) {
        await page.getByRole('button', { name: 'Show older entries' }).first().click();
        await page.waitForTimeout(1500);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(800);
      const b = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-7-long-before') });
      const gave = page.getByRole('button', { name: /You gave/ }).first();
      const inView = await gave.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
      const s = await postViaDrawer(page, /You gave/, '5', 'Scrolled post', { noScroll: true });
      const a = await khataFacts(page);
      await page.screenshot({ path: nShot('desktop', 'N2-8-long-after') });
      record('N2', `long khata scrolled past 50 rows then post → loaded depth kept (rows ${b.rows} → ${a.rows}, expect +1)`, b.rows > 50 && a.rows === b.rows + 1, `before ${JSON.stringify({ rows: b.rows, scrollY: b.scrollY })} after ${JSON.stringify({ rows: a.rows, scrollY: a.scrollY })}; You-gave button in viewport before click: ${inView}`);
      record('N2', 'long khata: scroll position kept after save (not thrown to top)', a.scrollY > 0 && Math.abs(a.scrollY - b.scrollY) < 400, `scrollY ${b.scrollY} → ${a.scrollY}`);
      reqCounts.push({ where: 'desktop gave 5 (long khata, 3 pages loaded)', reqs: s.reqs });
    }
    await ctx.close();
  }
  for (const r of reqCounts) note(`requests per save — ${r.where}: ${r.reqs.length} → ${JSON.stringify(r.reqs)}`);
  record('N2', 'requests per save reported (informational)', true, reqCounts.map((r) => `${r.where}: ${r.reqs.length}`).join('; '));
}

// ─── N4 (destructive, explicit only) ─────────────────────────────────────────
async function phaseN4(state) {
  const loginRaw = (email, password) => api('POST', '/auth/login', { email, password });
  const before = psql(`select scope||':'||count||':'||window_start||':'||coalesce(locked_until::text,'-') from platform_rate_limit where scope in ('login_ip','login_ip_fail')`);
  note(`N4 rate-limit rows before: ${before.replace(/\n/g, ' | ')}`);
  // 1. >100 successful sign-ins, one account, one IP.
  const statuses = {};
  const t0 = Date.now();
  for (let i = 0; i < 120; i += 1) {
    const r = await loginRaw(state.owner.email, state.owner.password);
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  }
  record('N4', '120 successful API sign-ins from one IP within the hour → all 200', statuses[200] === 120, `${JSON.stringify(statuses)} in ${Date.now() - t0}ms`);
  const failRow0 = psql(`select coalesce(max(count),0) from platform_rate_limit where scope='login_ip_fail'`);
  note(`login_ip_fail count after the 120 successes: ${failRow0} (successes must not charge it)`);
  // 2. failures to random addresses until 429
  const lockStart = new Date().toISOString();
  let firstLockAt = null; const fst = {};
  for (let i = 1; i <= 110; i += 1) {
    const r = await loginRaw(`nobody-${Date.now()}-${i}@random-${i}.test`, 'WrongPass123!');
    fst[r.status] = (fst[r.status] ?? 0) + 1;
    if (r.status === 429 && firstLockAt === null) { firstLockAt = i; break; }
  }
  const rowAfter = psql(`select count||' locked_until='||coalesce(locked_until::text,'-')||' window_start='||window_start from platform_rate_limit where scope='login_ip_fail'`);
  note(`failures sent: ${JSON.stringify(fst)}, first 429 on failure #${firstLockAt}; login_ip_fail row: ${rowAfter}; lockout began ${lockStart}`);
  const failBefore = Number(failRow0);
  record('N4', `the IP locks at the documented threshold of 100 failures (pre-existing failures in window: ${failBefore})`, firstLockAt !== null && firstLockAt + failBefore === 101, `first 429 on attempt #${firstLockAt} (+${failBefore} earlier = ${firstLockAt + failBefore})`);
  const right = await loginRaw(state.owner.email, state.owner.password);
  record('N4', 'while locked: the correct password is refused with 429', right.status === 429, `${right.status} ${JSON.stringify(right.body)} Retry-After=${right.headers.get('retry-after')}`);
  const known = await loginRaw(state.owner.email, 'WrongPass123!');
  const unknown = await loginRaw(`ghost-${Date.now()}@nowhere.test`, 'WrongPass123!');
  const strip = (b) => JSON.stringify({ ...b, meta: undefined, request_id: undefined, error: b?.error ? { ...b.error, request_id: undefined } : b?.error });
  record('N4', '429 body identical for a known and an unknown address (request id aside)', known.status === 429 && unknown.status === 429 && strip(known.body) === strip(unknown.body), `known ${known.status} ${JSON.stringify(known.body)} | unknown ${unknown.status} ${JSON.stringify(unknown.body)}`);
  note(`N4 lockout in force from ${lockStart}`);
  return { lockStart };
}

async function phaseN(browser, state, which) {
  mkdirSync(`${N_DIR}/phone`, { recursive: true });
  mkdirSync(`${N_DIR}/desktop`, { recursive: true });
  let token = null;
  const needToken = which.some((w) => w === 'N2' || w === 'N3');
  if (needToken) {
    const { ctx, token: t } = await nSession(browser, state.owner, { width: DESKTOP.width, height: DESKTOP.height }, N_STORAGE);
    token = t; await ctx.close();
    if ((await api('GET', '/auth/me', null, token)).status !== 200) { nLogins += 1; token = await login(state.owner.email, state.owner.password); }
  }
  if (which.includes('N3')) await phaseN3(browser, state, token);
  if (which.includes('N1')) await phaseN1(browser, state);
  if (which.includes('N2')) await phaseN2(browser, state, token);
  if (which.includes('N4')) await phaseN4(state);
  note(`sign-ins spent by N this run: ${nLogins}`);
}


// ═════════════════════════════════════════════════════════════════════════════
// F — final retest of 3f24388 (N1 skeleton, request-id label, phone format)
//     and 5499db8 (written-off totals, P1 sign-in after cookie expiry),
//     `--only=F` (or F1, F2, F3 individually).
//
//   F1  3f24388: phone skeleton rows card-shaped and inside the card; table
//       skeleton bars inside their cells; "Reference <id>" on the list error
//       state (en + hi) equal to the aborted request's X-Request-Id; the
//       server-error snackbar; +91 formatting, tel: and Copy in E.164.
//   F2  5499db8: written-off totals on the khata, the statement strip, a
//       dated statement, the print sheet, API closing == balance, reversal,
//       Hindi, and aging (fully written off absent; FIFO on a partial one).
//       Fixtures are made through the API in the sprint3 owner's tenant and
//       SAID SO: three new parties named "QA WO … <stamp>".
//   F3  5499db8 P1: expiry → sign in as another tenant at 360/767/1023/1024/
//       1440, one document load, never back to /login; fresh sign-in has zero
//       document loads; sign-out → sign-in; ?next=//evil.test/x.
//
// Screenshots: /tmp/e2e-shots/sprint3-qa/final/{phone,tablet,desktop}/.
// ═════════════════════════════════════════════════════════════════════════════
const F_DIR = `${SHOT_ROOT}/final`;
const F_STORAGE = `${F_DIR}/owner-storage.json`;
const F_STATE = `${F_DIR}/state.json`;
const fShot = (dir, name) => `${F_DIR}/${dir}/${name}.png`;
const F_SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1440, height: 900 },
];
const inrNum = (s) => (s == null ? null : Number(String(s).replace(/[₹,\s]/g, '')));

/** An owner session at `size`, optionally in Hindi. */
const fOwner = async (browser, state, size, { hi = false, clipboard = false } = {}) => {
  const s = await nSession(browser, state.owner, { width: size.width, height: size.height }, F_STORAGE);
  if (clipboard) await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: FRONTEND });
  if (hi) {
    await s.ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FRONTEND }]);
  }
  return s;
};

// ─── F1 ──────────────────────────────────────────────────────────────────────
async function phaseF1(browser, state) {
  const P = state.parties;

  // (a) Skeleton geometry, GET /parties held for 3 s.
  for (const size of F_SIZES) {
    const { ctx, page } = await fOwner(browser, state, size);
    await page.route(/\/api\/v1\/parties\?/, async (route) => {
      if (route.request().method() === 'GET') await sleep(3000);
      await route.continue().catch(() => {});
    });
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('[data-testid="ub-grid-skeleton-card"], [data-testid="ub-grid-skeleton-fallback-row"], tbody td .animate-pulse', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10, t: Math.round(b.top), w: Math.round(b.width * 10) / 10, h: Math.round(b.height) }; };
      const inside = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
      const cards = [...document.querySelectorAll('[data-testid="ub-grid-skeleton-card"]')];
      const fallback = [...document.querySelectorAll('[data-testid="ub-grid-skeleton-fallback-row"]')];
      const tdBars = [...document.querySelectorAll('tbody td .animate-pulse')];
      const bordered = (el) => { let p = el.parentElement; while (p && p !== document.body) { const cs = getComputedStyle(p); if (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0) return p; p = p.parentElement; } return null; };
      const cardInfo = cards.map((row) => {
        const bars = [...row.querySelectorAll('.animate-pulse')];
        const box = bordered(row);
        const rb = row.getBoundingClientRect(); const bb = box ? box.getBoundingClientRect() : null;
        return {
          row: r(row), box: box ? r(box) : null,
          rowInBox: bb ? inside(rb, bb) : null,
          bars: bars.map((b) => ({ ...r(b), radius: getComputedStyle(b).borderTopLeftRadius })),
          barsInRow: bars.every((b) => inside(b.getBoundingClientRect(), rb)),
          barsInViewport: bars.every((b) => b.getBoundingClientRect().right <= window.innerWidth + 0.5 && b.getBoundingClientRect().left >= -0.5),
        };
      });
      const tdInfo = tdBars.map((b) => { const td = b.closest('td'); return { bar: r(b), td: r(td), ok: inside(b.getBoundingClientRect(), td.getBoundingClientRect()) }; });
      const fbInfo = fallback.map((row) => { const bars = [...row.querySelectorAll('.animate-pulse')]; return { ok: bars.every((b) => inside(b.getBoundingClientRect(), row.getBoundingClientRect())), n: bars.length }; });
      return { cards: cardInfo, td: tdInfo, fallback: fbInfo, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    });
    await page.screenshot({ path: fShot(size.id, `F1-skeleton-${size.width}`) });
    await page.screenshot({ path: fShot(size.id, `F1-skeleton-${size.width}-full`), fullPage: true });
    note(`${size.id}: skeleton cards=${m.cards.length} td-bars=${m.td.length} fallback-rows=${m.fallback.length} scrollWidth=${m.scrollW}/${m.innerW}`);
    if (size.id === 'phone') {
      const shaped = m.cards.length > 0 && m.cards.every((c) => {
        const [disc, name, cap, amt] = c.bars;
        return c.bars.length === 4 && disc.w === 40 && disc.h === 40 && parseFloat(disc.radius) >= 20
          && name.w > 20 && cap.w > 10 && cap.w < name.w && amt.w > 10 && amt.w < name.w;
      });
      record('F1', 'phone 360: every skeleton row is card-shaped (40px disc, name bar, shorter caption bar, short amount bar)', shaped, JSON.stringify(m.cards[0]?.bars));
      record('F1', 'phone 360: every skeleton row and bar is inside its card and the viewport', m.cards.length > 0 && m.cards.every((c) => c.rowInBox !== false && c.barsInRow && c.barsInViewport), JSON.stringify(m.cards.map((c) => ({ row: c.row, box: c.box, inBox: c.rowInBox, bars: c.barsInRow }))).slice(0, 500));
      record('F1', 'phone 360: scrollWidth <= 360 while loading', m.scrollW <= 360, `${m.scrollW}`);
    } else {
      const tableMode = m.td.length > 0;
      record('F1', `${size.id} ${size.width}: skeleton bars stay within their cells (${tableMode ? 'table' : m.cards.length ? 'cards' : 'fallback'})`,
        (tableMode && m.td.every((x) => x.ok)) || (!tableMode && m.cards.length > 0 && m.cards.every((c) => c.barsInRow && c.barsInViewport)) || (!tableMode && m.fallback.length > 0 && m.fallback.every((x) => x.ok)),
        JSON.stringify(m.td.filter((x) => !x.ok).slice(0, 3)) + ` td=${m.td.length}`);
      record('F1', `${size.id} ${size.width}: no horizontal overflow while loading`, m.scrollW <= m.innerW, `${m.scrollW}/${m.innerW}`);
    }
    await ctx.close();
  }

  // (b) Request-id label on the list error state: abort GET /parties, change the query.
  for (const [size, hi] of [[PHONE, false], [DESKTOP, false], [PHONE, true], [DESKTOP, true]]) {
    const dir = size.id === 'phone' ? 'phone' : 'desktop';
    const tag = `${size.id}${hi ? '-hi' : ''}`;
    const { ctx, page } = await fOwner(browser, state, size, { hi });
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('main [data-testid="ub-grid-card"], main tbody tr').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    const aborted = [];
    await page.route(/\/api\/v1\/parties\?/, async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') return route.continue();
      aborted.push({ id: req.headers()['x-request-id'], url: req.url().replace(BACKEND, '') });
      await route.abort('failed');
    });
    const search = page.locator('main').getByLabel(hi ? 'ग्राहक खोजें' : 'Search customers').first();
    await search.fill('Rame');
    const idEl = page.locator('main [data-testid="request-id"]').first();
    await idEl.waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const shown = (await idEl.count()) ? (await idEl.innerText()).trim() : null;
    const mainText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    await page.screenshot({ path: fShot(dir, `F1-request-id-${tag}`) });
    const label = hi ? 'संदर्भ' : 'Reference';
    const last = aborted[aborted.length - 1]?.id;
    const mm = shown?.match(/^(\S+)\s+([0-9a-f-]{36})$/i);
    record('F1', `${tag}: list error reads "${label} <uuid>" and the uuid is the aborted request's X-Request-Id`,
      Boolean(mm) && mm[1] === label && mm[2] === last,
      `shown="${shown}" aborted=${JSON.stringify(aborted.map((a) => a.id))} (last ${last}) main="${mainText.slice(0, 220)}"`);
    await ctx.close();
  }

  // (c) A server-error snackbar carries "Reference <id>" (POST fulfilled 500 by the harness — nothing reaches the server).
  for (const size of [PHONE, DESKTOP]) {
    const dir = size.id === 'phone' ? 'phone' : 'desktop';
    const { ctx, page } = await fOwner(browser, state, size);
    await openKhata(page, P.ramesh, 'Ramesh Traders');
    let sentId = null;
    await page.route(/\/api\/v1\/parties\/[^/]+\/ledger-entries$/, async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      sentId = req.headers()['x-request-id'];
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-credentials': 'true',
          'access-control-expose-headers': 'X-Request-Id',
          'x-request-id': sentId,
        },
        body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong on our side.', details: {} } }),
      });
    });
    await page.getByRole('button', { name: 'You gave' }).first().click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.getByLabel('Amount').fill('1');
    await page.getByRole('button', { name: 'Save' }).click();
    const snackId = page.locator('[role="status"] [data-testid="request-id"], [role="alert"] [data-testid="request-id"]').first();
    await snackId.waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    const all = await page.locator('[data-testid="request-id"]').allInnerTexts();
    await page.screenshot({ path: fShot(dir, 'F1-server-error-snackbar') });
    record('F1', `${size.id}: the server-error snackbar reads "Reference <id>" with the request's X-Request-Id`, all.some((t) => t.trim() === `Reference ${sentId}`), `request-id nodes=${JSON.stringify(all)} sent=${sentId}`);
    await page.keyboard.press('Escape').catch(() => {});
    await ctx.close();
  }

  // (d) Phone format: stored "09812345678".
  const stored = psql(`select mobile from parties_party where id='${P.ramesh}'`);
  note(`Ramesh Traders mobile as stored (psql read): "${stored}"`);
  for (const size of [PHONE, DESKTOP]) {
    const dir = size.id === 'phone' ? 'phone' : 'desktop';
    const { ctx, page } = await fOwner(browser, state, size, { clipboard: true });
    await openKhata(page, P.ramesh, 'Ramesh Traders');
    const tel = page.locator('main a[href^="tel:"]').first();
    const href = await tel.getAttribute('href');
    const telText = (await tel.innerText()).trim();
    await page.getByRole('button', { name: 'Copy' }).first().click();
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`);
    await page.screenshot({ path: fShot(dir, 'F1-khata-mobile') });
    record('F1', `${size.id}: khata header shows "+91 98123 45678" linking tel:+919812345678`, telText === '+91 98123 45678' && href === 'tel:+919812345678', `text="${telText}" href=${href}`);
    record('F1', `${size.id}: Copy puts "+919812345678" on the clipboard`, clip === '+919812345678', `clipboard="${clip}"`);
    const details = page.getByRole('button', { name: 'Details' });
    if ((await details.count()) && (await details.first().isVisible())) {
      if ((await details.first().getAttribute('aria-expanded')) !== 'true') await details.first().click();
      await page.waitForTimeout(500);
    }
    const occurrences = await page.evaluate(() => {
      const out = [];
      const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const n = walker.currentNode; if (n.textContent.includes('98123') && n.parentElement.closest('a[href^="tel:"]') == null && n.parentElement.getClientRects().length) out.push(n.textContent.trim()); }
      return out;
    });
    await page.screenshot({ path: fShot(dir, 'F1-info-panel-mobile'), fullPage: true });
    record('F1', `${size.id}: info panel shows the same "+91 98123 45678"`, occurrences.includes('+91 98123 45678') && !occurrences.some((t) => t.includes('09812345678')), JSON.stringify(occurrences));
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('main [data-testid="ub-grid-card"], main tbody tr').first().waitFor({ timeout: 60000 });
    // Search rather than rely on page 1: other QA fixtures have more recent activity.
    await page.locator('main').getByLabel('Search customers').first().fill('Ramesh');
    await page.getByText('Ramesh Traders').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1000);
    const rowText = await page.evaluate(() => {
      const hits = [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Ramesh Traders' && e.getClientRects().length);
      const row = hits[0]?.closest('tr, li, [role="row"], a, [data-testid*="card"]') ?? hits[0]?.parentElement?.parentElement?.parentElement;
      return row ? row.innerText.replace(/\s+/g, ' ') : null;
    });
    await page.screenshot({ path: fShot(dir, 'F1-list-row-mobile') });
    // contactLine() is "code · mobile"; Ramesh has no code, so the row carries the formatted mobile alone.
    record('F1', `${size.id}: list row shows the formatted "+91 98123 45678" (never the stored "09812345678")`, Boolean(rowText) && rowText.includes('+91 98123 45678') && !rowText.includes('09812345678'), rowText);
    await ctx.close();
  }
}

// ─── F2 ──────────────────────────────────────────────────────────────────────
const WO_REASON = 'Shop closed, cannot recover';
async function phaseF2(browser, state) {
  const { ctx: c0, token } = await fOwner(browser, state, DESKTOP);
  await c0.close();
  const idem = (k) => ({ 'Idempotency-Key': `f2-${k}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  const stamp = String(Date.now()).slice(-5);
  const mkParty = async (name, body) => (await must('POST', '/parties', { name, mobile: null, ...body }, token, idem(name))).body.data.id;
  const post = async (pid, direction, amount, date, noteText) =>
    (await must('POST', `/parties/${pid}/ledger-entries`, { direction, amount, entry_date: date, note: noteText ?? '', ...(direction === 'credit' ? { payment_mode: 'cash' } : {}) }, token, idem(`${pid}-${amount}`))).body.data;
  const archiveWO = async (pid, amount) => must('POST', `/parties/${pid}/archive`, { write_off: { reason: WO_REASON, amount } }, token, idem(`arch-${pid}`));
  const summaryOf = async (pid) => (await must('GET', `/parties/${pid}/ledger-entries`, null, token)).body.meta?.summary;
  const balanceOf = async (pid) => { const d = (await must('GET', `/parties/${pid}`, null, token)).body.data; return d.balance ?? d.party?.balance; };

  // Fixtures (API): receivable, payable mirror, partial (aging), and a control with no write-off.
  const recv = await mkParty(`QA WO Recv ${stamp}`, { is_customer: true, opening_balance_amount: '2300.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(90) });
  await post(recv, 'debit', '500.00', daysAgo(30), 'Cement bags');
  await post(recv, 'credit', '300.00', daysAgo(10), 'Cash part payment');
  const recvArch = await archiveWO(recv, '2500.00');
  const pay = await mkParty(`QA WO Pay ${stamp}`, { is_customer: false, is_supplier: true, opening_balance_amount: '2300.00', opening_balance_direction: 'credit', opening_balance_as_of: daysAgo(90) });
  await post(pay, 'credit', '500.00', daysAgo(30), 'Goods received');
  await post(pay, 'debit', '300.00', daysAgo(10), 'Paid part');
  const payArch = await archiveWO(pay, '2500.00');
  const part = await mkParty(`QA WO Part ${stamp}`, { is_customer: true, opening_balance_amount: '1000.55', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(20) });
  await archiveWO(part, '1000.55');
  await must('POST', `/parties/${part}/restore`, {}, token, idem('restore-part'));
  const partOld = await api('POST', `/parties/${part}/ledger-entries`, { direction: 'debit', amount: '500.25', entry_date: daysAgo(100), note: 'Old bill found' }, token, idem('part-old'));
  note(`FIXTURE (API, sprint3 owner tenant): QA WO Recv ${stamp}=${recv} (opening 2300 Dr @${daysAgo(90)}, gave 500 @${daysAgo(30)}, got 300 @${daysAgo(10)}, archive+write-off 2500 → ${recvArch.status}); QA WO Pay ${stamp}=${pay} (opening 2300 Cr, got 500, gave 300, write-off 2500 → ${payArch.status}); QA WO Part ${stamp}=${part} (opening 1000.55 @${daysAgo(20)}, write-off 1000.55, restored, gave 500.25 @${daysAgo(100)} → ${partOld.status} ${partOld.status >= 400 ? JSON.stringify(partOld.body) : ''})`);
  writeFileSync(F_STATE, JSON.stringify({ stamp, recv, pay, part }, null, 2));

  // API: summaries, statements.
  const sR = await summaryOf(recv); const sP = await summaryOf(pay); const sC = await summaryOf(state.parties.ramesh);
  record('F2', 'API receivable summary: total_debit 2800.00, total_credit 300.00, written_off {credit 2500.00, debit 0.00}', sR?.total_debit === '2800.00' && sR?.total_credit === '300.00' && sR?.written_off?.credit === '2500.00' && sR?.written_off?.debit === '0.00', JSON.stringify(sR));
  record('F2', 'API payable summary: total_debit 300.00, total_credit 2800.00, written_off {debit 2500.00, credit 0.00}', sP?.total_debit === '300.00' && sP?.total_credit === '2800.00' && sP?.written_off?.debit === '2500.00' && sP?.written_off?.credit === '0.00', JSON.stringify(sP));
  for (const [nm, pid] of [['receivable', recv], ['payable', pay], ['partial', part], ['Ramesh (no write-off)', state.parties.ramesh]]) {
    const st = (await must('GET', `/parties/${pid}/statement`, null, token)).body.data;
    const bal = await balanceOf(pid);
    record('F2', `API ${nm}: unbounded statement closing (${st.closing_balance}) == party balance (${bal})`, Number(st.closing_balance) === Number(bal), JSON.stringify({ opening: st.opening_balance, closing: st.closing_balance, totals: st.totals }));
  }
  const dated = (await must('GET', `/parties/${recv}/statement?date_from=${daysAgo(60)}`, null, token)).body.data;
  const dT = dated.totals;
  const recon = Number(dated.opening_balance) + Number(dT.debit) - Number(dT.credit) - Number(dT.written_off.credit) + Number(dT.written_off.debit);
  record('F2', `API receivable statement from ${daysAgo(60)}: brought forward + gave − got − written off == closing`, Math.abs(recon - Number(dated.closing_balance)) < 0.001 && dated.opening_balance === '2300.00', JSON.stringify({ opening: dated.opening_balance, totals: dT, closing: dated.closing_balance, recon }));

  // Khata screens.
  for (const size of F_SIZES) {
    const { ctx, page } = await fOwner(browser, state, size);
    for (const [key, pid, name, exp] of [
      ['recv', recv, `QA WO Recv ${stamp}`, { gave: '₹2,800.00', got: '₹300.00', wo: '₹2,500.00' }],
      ['pay', pay, `QA WO Pay ${stamp}`, { gave: '₹300.00', got: '₹2,800.00', wo: '₹2,500.00' }],
      ['control', state.parties.ramesh, 'Ramesh Traders', { gave: null, got: null, wo: null }],
    ]) {
      await openKhata(page, pid, name);
      await page.waitForTimeout(1500);
      const t = await page.locator('main').innerText();
      const gave = t.match(/You gave in all\s*\n\s*(₹[\d,]+\.\d\d)/)?.[1] ?? null;
      const got = t.match(/You got in all\s*\n\s*(₹[\d,]+\.\d\d)/)?.[1] ?? null;
      const woLine = t.match(/(Written off[^\n]*)\n\s*(₹[\d,]+\.\d\d)/);
      const overflow = await overflowPx(page);
      await page.screenshot({ path: fShot(size.id, `F2-khata-${key}`), fullPage: true });
      if (key === 'control') {
        record('F2', `${size.id}: a party with no write-off shows no "Written off" line`, !/Written off/.test(t), `gave=${gave} got=${got}`);
      } else {
        record('F2', `${size.id}: ${key} khata — gave ${exp.gave}, got ${exp.got}, "${woLine?.[1]}" ${exp.wo}, Settled`,
          gave === exp.gave && got === exp.got && woLine?.[2] === exp.wo && /Settled/.test(t),
          `gave=${gave} got=${got} wo=${JSON.stringify(woLine?.slice(1))} settled=${/Settled/.test(t)}`);
      }
      record('F2', `${size.id}: ${key} khata fits the viewport`, overflow <= 0, `overflow ${overflow}px`);
    }

    // Statement, All time.
    await page.goto(`${FRONTEND}/parties/${recv}/statement?preset=allTime`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('[data-testid="statement-screen"]').waitFor({ timeout: 60000 });
    await page.getByText('Brought forward').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const stText = (await page.locator('[data-testid="statement-screen"]').innerText());
    const pick = (label) => stText.match(new RegExp(`${label}\\s*\\n\\s*(₹[\\d,]+\\.\\d\\d)`))?.[1] ?? null;
    const strip = { bf: pick('Brought forward'), gave: pick('You gave'), got: pick('You got'), wo: pick('Written off(?: \\([^)]*\\))?'), closing: pick('Closing balance') };
    await page.screenshot({ path: fShot(size.id, 'F2-statement-alltime'), fullPage: true });
    record('F2', `${size.id}: statement All time strip — Brought forward ₹0.00 · You gave ₹2,800.00 · You got ₹300.00 · Written off ₹2,500.00 · Closing ₹0.00 Settled`,
      strip.bf === '₹0.00' && strip.gave === '₹2,800.00' && strip.got === '₹300.00' && strip.wo === '₹2,500.00' && strip.closing === '₹0.00' && /Settled/.test(stText),
      JSON.stringify(strip));
    record('F2', `${size.id}: statement fits the viewport`, (await overflowPx(page)) <= 0, `${await overflowPx(page)}px`);

    // Print sheet.
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(700);
    const sheet = page.locator('.ub-print-sheet');
    const sheetText = await sheet.innerText();
    const woRows = await page.evaluate(() => {
      const table = document.querySelector('.ub-print-sheet table');
      if (!table) return { err: 'no table' };
      const heads = [...table.querySelectorAll('thead th')].map((h) => h.innerText.trim());
      const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim()));
      return { heads, rows: rows.filter((r) => r.some((c) => /Write-off/.test(c))) };
    });
    await page.screenshot({ path: fShot(size.id, 'F2-print-sheet'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    const gi = woRows.heads?.findIndex((h) => /You gave/.test(h)); const oi = woRows.heads?.findIndex((h) => /You got/.test(h));
    const r0 = woRows.rows?.[0];
    const occurrences = (sheetText.match(/Write-off · Shop closed, cannot recover/g) ?? []).length;
    record('F2', `${size.id}: print sheet summary has "Written off"`, /Written off/.test(sheetText.split(/\n/).slice(0, 40).join('\n')), sheetText.replace(/\s+/g, ' ').slice(0, 400));
    record('F2', `${size.id}: print row reads "Write-off · ${WO_REASON}" once, ₹2,500.00 in the You got column, You gave empty`,
      occurrences === 1 && woRows.rows?.length === 1 && r0 && /2,500\.00/.test(r0[oi]) && !r0[gi],
      JSON.stringify(woRows));
    await ctx.close();
  }

  // Statement from a date after the opening (UI), phone + desktop.
  for (const size of [PHONE, DESKTOP]) {
    const { ctx, page } = await fOwner(browser, state, size);
    await page.goto(`${FRONTEND}/parties/${recv}/statement?preset=custom&from=${daysAgo(60)}&to=${IST_DATE()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText('Brought forward').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const t = await page.locator('[data-testid="statement-screen"]').innerText();
    const pick = (label) => inrNum(t.match(new RegExp(`${label}\\s*\\n\\s*(₹[\\d,]+\\.\\d\\d)`))?.[1]);
    const v = { bf: pick('Brought forward'), gave: pick('You gave'), got: pick('You got'), wo: pick('Written off(?: \\([^)]*\\))?'), closing: pick('Closing balance') };
    await page.screenshot({ path: fShot(size.id === 'phone' ? 'phone' : 'desktop', 'F2-statement-dated'), fullPage: true });
    record('F2', `${size.id}: statement from ${daysAgo(60)} reconciles (BF + gave − got − written off = closing)`, v.bf === 2300 && v.gave === 500 && v.got === 300 && v.wo === 2500 && Math.abs(v.bf + v.gave - v.got - v.wo - v.closing) < 0.001, JSON.stringify(v));
    await ctx.close();
  }

  // Hindi khata.
  {
    const { ctx, page } = await fOwner(browser, state, PHONE, { hi: true });
    await page.goto(`${FRONTEND}/parties/${recv}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('heading', { name: `QA WO Recv ${stamp}` }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    const t = await page.locator('main').innerText();
    const line = t.match(/(कुल बट्टे खाते में[^\n]*)\n\s*(₹[\d,]+\.\d\d)/);
    await page.screenshot({ path: fShot('phone', 'F2-khata-recv-hi'), fullPage: true });
    record('F2', 'hi: khata reads "कुल बट्टे खाते में …" ₹2,500.00', line?.[2] === '₹2,500.00', JSON.stringify(line?.slice(1)));
    await page.goto(`${FRONTEND}/parties/${recv}/statement?preset=allTime`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(3000);
    const st = await page.locator('main').innerText();
    await page.screenshot({ path: fShot('phone', 'F2-statement-hi'), fullPage: true });
    record('F2', 'hi: statement strip reads "बट्टे खाते में" ₹2,500.00 (side suffix only when both directions carry a write-off)', /बट्टे खाते में(?: \([^)]*\))?\s*\n\s*₹2,500\.00/.test(st), st.replace(/\s+/g, ' ').slice(0, 300));
    await ctx.close();
  }

  // Aging (API + screen): fully written off absent; FIFO on the partial one.
  const agR = (await must('GET', '/ledger/aging?type=receivable&page_size=100', null, token)).body;
  const agP = (await must('GET', '/ledger/aging?type=payable&page_size=100', null, token)).body;
  const rowsR = agR.data ?? agR.data?.rows ?? [];
  const rowsP = agP.data ?? [];
  const findRow = (rows, pid) => (Array.isArray(rows) ? rows : rows.rows ?? []).find((r) => (r.party_id ?? r.id ?? r.party?.id) === pid);
  note(`aging receivable meta=${JSON.stringify(agR.meta).slice(0, 300)}`);
  record('F2', 'aging API: the fully written-off receivable party is absent', !findRow(rowsR, recv), JSON.stringify(findRow(rowsR, recv) ?? null));
  record('F2', 'aging API: the fully written-off payable party is absent', !findRow(rowsP, pay), JSON.stringify(findRow(rowsP, pay) ?? null));
  const pr = findRow(rowsR, part);
  note(`aging row for QA WO Part: ${JSON.stringify(pr)}`);
  const buckets = pr?.buckets ?? pr;
  const vals = pr ? Object.entries(buckets).filter(([k, v]) => typeof v === 'string' && /^-?\d+\.\d\d$/.test(v)) : [];
  record('F2', `aging API: partial write-off applied to the OLDEST debit first — 500.25 (@${daysAgo(100)}) fully covered, 500.25 left in the 0–30 bucket, nothing in the 90+ bucket`,
    Boolean(pr) && pr['0_30'] === '500.25' && pr['31_60'] === '0.00' && pr['61_90'] === '0.00' && pr['90_plus'] === '0.00' && pr.total === '500.25' && Number(await balanceOf(part)) === 500.25,
    JSON.stringify(pr));
  {
    const { ctx, page } = await fOwner(browser, state, DESKTOP);
    await page.goto(`${FRONTEND}/ledger/aging`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText(`QA WO Part ${stamp}`).first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const t = await page.locator('main').innerText();
    await page.screenshot({ path: fShot('desktop', 'F2-aging'), fullPage: true });
    record('F2', 'aging screen: partial party listed, fully written-off party not', t.includes(`QA WO Part ${stamp}`) && !t.includes(`QA WO Recv ${stamp}`), t.replace(/\s+/g, ' ').slice(0, 400));
    await ctx.close();
  }

  // Reversal: refused while archived, then restore and reverse.
  const entries = (await must('GET', `/parties/${recv}/ledger-entries`, null, token)).body.data;
  const wo = entries.find((e) => e.entry_type === 'write_off');
  const refused = await api('POST', `/ledger-entries/${wo.id}/reverse`, { reason: 'Customer paid after all' }, token, idem('rev-archived'));
  record('F2', 'reversing a write-off on an ARCHIVED party is refused', refused.status === 409 && refused.body?.error?.code === 'party_archived', `${refused.status} ${JSON.stringify(refused.body?.error ?? refused.body)}`);
  const restored = await api('POST', `/parties/${recv}/restore`, {}, token, idem('restore-recv'));
  const reversed = await api('POST', `/ledger-entries/${wo.id}/reverse`, { reason: 'Customer paid after all' }, token, idem('rev'));
  note(`restore → ${restored.status}; reverse → ${reversed.status}`);
  const sR2 = await summaryOf(recv); const bal2 = await balanceOf(recv);
  record('F2', 'API after reversal: written_off 0.00, gave 2800.00 / got 300.00 unchanged, balance back to 2500.00', sR2?.written_off?.credit === '0.00' && sR2?.total_debit === '2800.00' && sR2?.total_credit === '300.00' && Number(bal2) === 2500, `${JSON.stringify(sR2)} balance=${bal2}`);
  const st3 = (await must('GET', `/parties/${recv}/statement`, null, token)).body.data;
  record('F2', 'API after reversal: unbounded statement closing == balance', Number(st3.closing_balance) === Number(bal2), JSON.stringify({ closing: st3.closing_balance, totals: st3.totals }));
  for (const size of [PHONE, DESKTOP]) {
    const { ctx, page } = await fOwner(browser, state, size);
    await openKhata(page, recv, `QA WO Recv ${stamp}`);
    await page.waitForTimeout(1500);
    const t = await page.locator('main').innerText();
    const gave = t.match(/You gave in all\s*\n\s*(₹[\d,]+\.\d\d)/)?.[1] ?? null;
    const got = t.match(/You got in all\s*\n\s*(₹[\d,]+\.\d\d)/)?.[1] ?? null;
    await page.screenshot({ path: fShot(size.id === 'phone' ? 'phone' : 'desktop', 'F2-khata-recv-after-reversal'), fullPage: true });
    record('F2', `${size.id}: after reversal the khata has no "Written off" line; gave ₹2,800.00 / got ₹300.00 unchanged`, !/Written off/.test(t) && gave === '₹2,800.00' && got === '₹300.00', `gave=${gave} got=${got} woLine=${/Written off/.test(t)}`);
    await ctx.close();
  }
}

// ─── F3 ──────────────────────────────────────────────────────────────────────
async function phaseF3(browser, state) {
  const rt = JSON.parse(readFileSync(RT_ACCOUNTS, 'utf8'));
  const B = { email: rt.R2.email, password: RT_PASSWORD, shop: 'Retest Browser Traders' };
  const A = { email: rt.R1.email, password: RT_PASSWORD, shop: 'Retest Budget Stores' };
  const WIDTHS = [
    { w: 360, h: 780, dir: 'phone' },
    { w: 767, h: 1024, dir: 'tablet' },
    { w: 1023, h: 768, dir: 'tablet' },
    { w: 1024, h: 768, dir: 'desktop' },
    { w: 1440, h: 900, dir: 'desktop' },
  ];
  const submit = async (page, who) => {
    await page.locator('input[type="email"]').waitFor({ timeout: 30000 });
    await page.fill('input[type="email"]', who.email);
    await page.fill('input[type="password"]', who.password);
    await page.click('button[type="submit"]');
  };
  const signOut = async (page, W) => {
    let resized = false;
    if (W.w < 1024) { await page.setViewportSize({ width: 1440, height: 900 }); resized = true; await page.waitForTimeout(600); }
    await page.getByRole('button', { name: /^Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30000 });
    if (resized) await page.setViewportSize({ width: W.w, height: W.h });
    await page.waitForTimeout(1200);
  };
  for (const W of WIDTHS) {
    const tag = `${W.w}`;
    const ctx = await browser.newContext({ viewport: { width: W.w, height: W.h } });
    let armed = false; const leaks = []; const docs = [];
    await ctx.exposeBinding('__fDoc', (_s, where) => { docs.push(where); });
    await ctx.exposeBinding('__fLeak', (_s, n, where) => { if (armed) leaks.push({ n, where }); });
    await ctx.addInitScript((names) => {
      window.__fDoc(`${location.pathname}${location.search}`);
      const start = () => {
        const scan = (node) => { const t = node.textContent || ''; for (const n of names) if (t.includes(n)) window.__fLeak(n, `${location.pathname}${location.search}`); };
        scan(document.body);
        new MutationObserver((ms) => { for (const m of ms) { m.addedNodes.forEach(scan); if (m.type === 'characterData') scan(m.target); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
      };
      if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    }, B_NAMES);
    const page = await ctx.newPage();
    const navs = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(FRONTEND, '')); });

    // 1. Fresh sign-in as B on a newly loaded /login: zero document loads.
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1500);
    const d0 = docs.length;
    await submit(page, B);
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
    await page.getByText(B.shop).filter({ visible: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    record('F3', `${tag}: fresh sign-in on a newly loaded /login → ${new URL(page.url()).pathname} with ZERO document loads`, docs.length === d0 && !page.url().includes('/login'), `docs after submit ${JSON.stringify(docs.slice(d0))} url=${page.url().replace(FRONTEND, '')}`);

    // 2. /ledger/aging as B, then the cookies expire.
    await page.goto(`${FRONTEND}/ledger/aging`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText('Upi Party').first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: fShot(W.dir, `F3-${tag}-0-B-aging`) });
    await ctx.clearCookies({ name: 'ub_access' });
    await ctx.clearCookies({ name: 'ub_refresh' });
    armed = true;
    const d1 = docs.length; const v1 = navs.length;
    const how = W.w < 1024 ? 'logo' : 'sidebar Customers link';
    if (W.w < 1024) await page.getByRole('link', { name: /go to Customers/i }).first().click();
    else await page.locator('nav a[href="/parties"]').first().click();
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const loginUrl = page.url().replace(FRONTEND, '');
    await page.screenshot({ path: fShot(W.dir, `F3-${tag}-1-login-after-expiry`) });
    record('F3', `${tag}: cookies deleted, ${how} → /login (client-side)`, loginUrl.startsWith('/login') && docs.length === d1, `${loginUrl} docs+${docs.length - d1} navs=${JSON.stringify(navs.slice(v1))}`);

    // 3. ONE submit as A.
    const d2 = docs.length; const v2 = navs.length;
    await submit(page, A);
    await page.getByText(A.shop).filter({ visible: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const me = await whoAmI(page);
    const shopA = await page.getByText(A.shop).filter({ visible: true }).count();
    await page.screenshot({ path: fShot(W.dir, `F3-${tag}-2-landed-as-A`) });
    const afterNavs = navs.slice(v2);
    record('F3', `${tag}: ONE submit as A lands on A's /parties — exactly one document load, never back to /login`,
      new URL(page.url()).pathname === '/parties' && me.email === A.email && shopA > 0 && docs.slice(d2).length === 1 && !docs.slice(d2)[0].startsWith('/login') && !afterNavs.slice(1).some((u) => u.startsWith('/login')),
      `url=${page.url().replace(FRONTEND, '')} me=${me.email} shopA=${shopA} docs=${JSON.stringify(docs.slice(d2))} navs=${JSON.stringify(afterNavs)}`);
    record('F3', `${tag}: B's shop name / parties never rendered after expiry`, leaks.length === 0, JSON.stringify(leaks.slice(0, 3)));

    // 4. Logo (or the sidebar Customers link — Dashboard left the sidebar in
    //    the UAT-fix batch) afterwards stays signed in.
    const v3 = navs.length;
    if (W.w < 1024) await page.getByRole('link', { name: /go to Customers/i }).first().click();
    else await page.locator('nav a[href="/parties"]').first().click();
    await page.waitForTimeout(3000);
    const me2 = await whoAmI(page);
    await page.screenshot({ path: fShot(W.dir, `F3-${tag}-3-logo-after`) });
    record('F3', `${tag}: tapping the ${W.w < 1024 ? 'logo' : 'sidebar Customers link'} afterwards stays signed in as A`, !page.url().includes('/login') && me2.email === A.email && (await page.getByText(A.shop).filter({ visible: true }).count()) > 0, `url=${page.url().replace(FRONTEND, '')} me=${me2.email} navs=${JSON.stringify(navs.slice(v3))}`);

    // 5. Sign-out control below lg (observation), then sign out and in again.
    if (W.w < 1024) {
      const burger = page.getByRole('button', { name: /open navigation|menu/i }).first();
      let found = 0;
      if (await burger.count()) {
        await burger.click(); await page.waitForTimeout(700);
        found = await page.getByText(/^Sign out$/).filter({ visible: true }).count();
        await page.screenshot({ path: fShot(W.dir, `F3-${tag}-4-drawer`) });
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        // The drawer's close transition outlasts 400 ms; while it is still
        // mounted the header behind it is inert and its account button is not
        // "visible" to getByRole. Wait for it to go before counting.
        await page.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      }
      found += await page.getByRole('button', { name: /^Account menu for/ }).filter({ visible: true }).count();
      record('F3', `${tag}: a Sign out control is reachable below 1024 px (drawer or account menu)`, found > 0, `visible sign-out/account controls: ${found}`);
    }
    await signOut(page, W);
    const d4 = docs.length;
    await submit(page, A);
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {});
    await page.getByText(A.shop).filter({ visible: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const me3 = await whoAmI(page);
    await page.screenshot({ path: fShot(W.dir, `F3-${tag}-5-signin-after-signout`) });
    record('F3', `${tag}: sign-out then sign-in works`, !page.url().includes('/login') && me3.email === A.email, `url=${page.url().replace(FRONTEND, '')} me=${me3.email} docs=${JSON.stringify(docs.slice(d4))}`);

    // 6. ?next=//evil.test/x after sign-out.
    await signOut(page, W);
    await page.goto(`${FRONTEND}/login?next=//evil.test/x`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1200);
    await submit(page, A);
    await page.waitForTimeout(5000);
    const host = new URL(page.url()).host;
    await page.screenshot({ path: fShot(W.dir, `F3-${tag}-6-next-evil`) }).catch(() => {});
    record('F3', `${tag}: ?next=//evil.test/x after sign-out stays on localhost`, host === 'localhost:3000', page.url());
    await ctx.close();
  }
}

async function phaseF(browser, state, which) {
  for (const d of ['phone', 'tablet', 'desktop']) mkdirSync(`${F_DIR}/${d}`, { recursive: true });
  if (which.includes('F1')) await phaseF1(browser, state);
  if (which.includes('F2')) await phaseF2(browser, state);
  if (which.includes('F3')) await phaseF3(browser, state);
  note(`sign-ins spent by F this run (owner sessions): ${nLogins}`);
}

const main = async () => {
  // R alone reuses the stored accounts without seed()'s API sign-in (login budget).
  // N (and its sub-phases) likewise.
  const N_PHASES = [...new Set(PHASES.flatMap((p) => (p === 'N' ? ['N3', 'N1', 'N2'] : /^N\d$/.test(p) ? [p] : [])))];
  const F_PHASES = [...new Set(PHASES.flatMap((p) => (p === 'F' ? ['F1', 'F2', 'F3'] : /^F\d$/.test(p) ? [p] : [])))];
  const reuseOnly = PHASES.every((p) => p === 'R' || p === 'N' || /^N\d$/.test(p) || p === 'F' || /^F\d$/.test(p));
  const state = reuseOnly && existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : await seed();
  if (process.argv.includes('--seed-only')) { console.log(JSON.stringify(state, null, 2)); return; }
  const browser = await chromium.launch();
  if (PHASES.includes('A')) await phaseA(browser, state);
  if (PHASES.includes('B')) await phaseB(browser, state);
  if (PHASES.includes('C')) await phaseC(browser, state);
  if (PHASES.includes('R')) await phaseR(browser, state);
  if (N_PHASES.length) await phaseN(browser, state, N_PHASES);
  if (F_PHASES.length) await phaseF(browser, state, F_PHASES);
  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL [${r.id}] ${r.check}`);
  writeFileSync(`${SHOT_ROOT}/results-${PHASES.join('')}.json`, JSON.stringify(results, null, 2));
  process.exit(passed === results.length ? 0 : 1);
};
main().catch((e) => { console.error(e); process.exit(1); });
