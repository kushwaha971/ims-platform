#!/usr/bin/env node
/**
 * e2e/defects2-qa.mjs — independent QA of the NEW-1 / NEW-2 / D-L1…D-L7 fix
 * batch, against the LIVE stack, through the browser AND the API.
 *
 *   node e2e/defects2-qa.mjs --only=O --user=<email>          # NEW-1 + D-L5, en (fresh user, no tenant)
 *   node e2e/defects2-qa.mjs --only=O --user=<email> --hi     # the same in Hindi
 *   node e2e/defects2-qa.mjs --only=T --user=<email>          # NEW-1: two tabs submit step 1 at once
 *   node e2e/defects2-qa.mjs --only=S --user=<owner email>    # NEW-1: staff member onboards their own, + Add a business
 *   node e2e/defects2-qa.mjs --only=M --user=<owner email>    # NEW-2 Team → Add member, taken mobile
 *   node e2e/defects2-qa.mjs --only=L --user=<owner email>    # D-L1…D-L4, D-L6, D-L7
 *
 * Accounts are passed in (password Dukaan2026x) because `register_ip` is a
 * DB-backed budget of 20 an hour. Screenshots → /tmp/e2e-shots/defects2/{phone,desktop}.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BE = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOTS = process.env.E2E_SHOTS_DIR ?? '/tmp/e2e-shots/defects2';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const PHASES = (arg('only') ?? 'O').split(',');
const USER = arg('user');
const PASSWORD = arg('password') ?? 'Dukaan2026x';
const HI = process.argv.includes('--hi');
const LANG = HI ? 'hi' : 'en';
mkdirSync(`${SHOTS}/phone`, { recursive: true });
mkdirSync(`${SHOTS}/desktop`, { recursive: true });

const results = [];
const record = (id, check, ok, detail = '') => {
  results.push({ id, check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  [${id}] ${check}${detail ? `\n        ${String(detail).slice(0, 700)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  const w = page.viewportSize().width;
  const dir = w < 768 ? 'phone' : 'desktop';
  const path = `${SHOTS}/${dir}/${name}-${w}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
};

const api = async (method, path, body, token, extra = {}) => {
  const r = await fetch(`${BE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client': 'api', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const login = async (email, password = PASSWORD) => (await api('POST', '/auth/login', { email, password })).body.data.access_token;
const myTenants = async (email, password = PASSWORD) => (await api('GET', '/auth/me', null, await login(email, password))).body.data.tenants;

const signIn = async (page, email, password = PASSWORD) => {
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
};

const T = {
  en: {
    name: 'Business name', state: 'State', type: 'What kind of business?', cont: 'Continue', back: 'Back',
    step1: 'Tell us about your business', step2: 'GST details', step3: 'Address', step4: 'Almost done',
    retail: /Retail shop/, unreg: /Not registered under GST/, line1: 'Address line 1', city: 'City', pin: 'PIN code', phone: 'Shop phone',
    finish: /Start using/, maha: 'Maharashtra', skip: /Skip for now/,
  },
  hi: {
    name: 'व्यापार का नाम', state: 'राज्य', type: null, cont: 'आगे बढ़ें', back: 'पीछे',
    step1: null, step2: null, step3: null, step4: null,
    retail: /रिटेल|खुदरा|दुकान/, unreg: /पंजीकृत नहीं/, line1: null, city: null, pin: null, phone: null,
    finish: /इस्तेमाल शुरू करें/, maha: 'महाराष्ट्र', skip: /अभी छोड़ें|छोड़ें/,
  },
};

/** Words that promise unbuilt features (D-L5). Hindi equivalents alongside. */
const UNBUILT = /\b(bills?|invoices?|stock|units?|expenses?|estimates?|dashboard)\b|change (it |any of it |everything )?later|in Settings|बिल|इनवॉइस|स्टॉक|इकाई|खर्च|ख़र्च|अनुमान|डैशबोर्ड|बाद में/i;

// ─────────────────────────────────────────────────────────────────────────────
async function phaseO(browser) {
  const id = HI ? 'O-hi' : 'O-en';
  const email = USER;
  const FROM2 = arg('from') === '2';
  const before = await myTenants(email);
  if (!FROM2) record(id, 'precondition: the account has no business yet', before.length === 0, JSON.stringify(before));

  const ctx = await browser.newContext({ viewport: HI ? { width: 1280, height: 800 } : { width: 390, height: 844 } });
  if (HI) await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
  const page = await ctx.newPage();
  const tenantCalls = [];
  const errors = [];
  page.on('request', (r) => { if (/\/api\/v1\/tenants(\/current)?$/.test(new URL(r.url()).pathname) && r.method() !== 'OPTIONS') tenantCalls.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/401|403/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });

  await signIn(page, email);
  const name1 = HI ? 'मीना जनरल स्टोर' : 'Meena General Store';
  if (FROM2) {
    record(id, 'sign-in with an unfinished business (step 1 done) lands in the wizard at step 2', /\/onboarding\/step\/2/.test(page.url()), page.url());
  } else {
  record(id, 'a fresh sign-up lands on /onboarding/step/1', /\/onboarding\/step\/1/.test(page.url()), page.url());
  const ls = async () => page.evaluate(() => localStorage.getItem('ub.onboarding.tenantCreateKey'));
  const keyBefore = await ls();
  record(id, 'the step-1 Idempotency-Key is persisted in localStorage before submit', Boolean(keyBefore), String(keyBefore));
  // Reload before submitting: the SAME key must come back.
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  record(id, 'a reload before submit keeps the same key', (await ls()) === keyBefore, `${keyBefore} → ${await ls()}`);

  const bodyText1 = await page.locator('main').innerText();
  const aside1 = await page.locator('aside, [role="complementary"]').first().innerText().catch(() => '');
  record(id, 'D-L5 step 1 copy mentions no unbuilt feature', !UNBUILT.test(bodyText1 + aside1), (bodyText1 + aside1).match(UNBUILT)?.[0] ?? '');
  await shot(page, `onb-${LANG}-step1-empty`);

  // ── Step 1 ────────────────────────────────────────────────────────────────
  await page.getByRole('textbox').first().fill(name1);
  await page.getByRole('combobox').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.type(HI ? 'महा' : 'Mahar');
  await page.waitForTimeout(400);
  await page.getByRole('option', { name: T[LANG].maha }).first().click();
  await page.getByRole('radio').first().click();
  await page.waitForTimeout(300);
  const c0 = tenantCalls.length;
  await page.getByRole('button', { name: T[LANG].cont }).click();
  await page.waitForURL(/\/onboarding\/step\/2/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  record(id, 'step 1 submit → POST /tenants → /onboarding/step/2', /step\/2/.test(page.url()) && tenantCalls.slice(c0).includes('POST /api/v1/tenants'), `${page.url()} ${JSON.stringify(tenantCalls.slice(c0))}`);
  record(id, 'the persisted key is cleared after the create', (await ls()) === null, String(await ls()));
  }

  // ── Refresh on step 2 (with the resume read slowed so the skeleton is visible) ──
  let slow = true;
  await page.route('**/api/v1/tenants/current', async (route) => { if (slow && route.request().method() === 'GET') await sleep(2500); await route.continue().catch(() => {}); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const skel = await page.locator('[aria-busy="true"], [data-testid*="skeleton" i], .animate-pulse').count();
  await shot(page, `onb-${LANG}-step2-reload-skeleton`);
  record(id, 'reload on step 2: a skeleton is drawn while the business is read back', skel > 0, `skeleton nodes=${skel}`);
  slow = false;
  await page.waitForTimeout(3500);
  record(id, 'reload on step 2: URL stays /onboarding/step/2', /step\/2/.test(page.url()), page.url());
  const h2a = await page.locator('main h2').first().innerText().catch(() => '');
  record(id, 'reload on step 2: the GST step is shown (not step 1)', HI ? !/व्यापार के बारे/.test(h2a) : h2a.includes(T.en.step2), h2a);
  await shot(page, `onb-${LANG}-step2-after-reload`);

  // ── Back to step 1: prefilled? ────────────────────────────────────────────
  await page.getByRole('button', { name: T[LANG].back }).first().click();
  await page.waitForURL(/step\/1/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const nameVal = await page.getByRole('textbox').first().inputValue();
  const stateTxt = await page.getByRole('combobox').first().innerText();
  const checked = await page.getByRole('radio', { checked: true }).count();
  record(id, 'Back to step 1 after reload: name/state/type prefilled', nameVal === name1 && stateTxt.includes(T[LANG].maha) && checked === 1, `name="${nameVal}" state="${stateTxt}" checked=${checked}`);

  // ── Hard reload ON step 1 ────────────────────────────────────────────────
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const nameVal2 = await page.getByRole('textbox').first().inputValue();
  const stateTxt2 = await page.getByRole('combobox').first().innerText();
  const checked2 = await page.getByRole('radio', { checked: true }).count();
  await shot(page, `onb-${LANG}-step1-after-reload`);
  record(id, 'reload ON step 1: URL stays step/1 and values are prefilled (the original bug)', /step\/1/.test(page.url()) && nameVal2 === name1 && stateTxt2.includes(T[LANG].maha) && checked2 === 1, `url=${page.url()} name="${nameVal2}" state="${stateTxt2}" checked=${checked2}`);

  // Resubmit step 1 with a change: must PATCH, not POST.
  const name2 = HI ? 'मीना स्टोर्स' : 'Meena Stores';
  await page.getByRole('textbox').first().fill(name2);
  const c1 = tenantCalls.length;
  await page.getByRole('button', { name: T[LANG].cont }).click();
  await page.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  record(id, 'resubmit step 1 after reload → PATCH /tenants/current (no POST) → step 2', !tenantCalls.slice(c1).includes('POST /api/v1/tenants') && tenantCalls.slice(c1).includes('PATCH /api/v1/tenants/current') && /step\/2/.test(page.url()), JSON.stringify(tenantCalls.slice(c1)));

  // ── The belt-and-braces case: client memory AND localStorage wiped ────────
  await page.goto(`${FE}/onboarding/step/1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const nameVal3 = await page.getByRole('textbox').first().inputValue();
  record(id, 'localStorage cleared + reload on step 1: still prefilled from the server', nameVal3 === name2, `name="${nameVal3}"`);

  // ── Step 2 ────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: T[LANG].cont }).click();
  await page.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const t2 = await page.locator('main').innerText();
  record(id, 'D-L5 step 2 (GST) copy mentions no unbuilt feature', !UNBUILT.test(t2), t2.match(UNBUILT)?.[0] ?? '');
  await shot(page, `onb-${LANG}-step2`);
  await page.getByRole('radio', { name: T[LANG].unreg }).first().click().catch(() => {});
  await page.getByRole('button', { name: T[LANG].cont }).click();
  await page.waitForURL(/step\/3/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  record(id, 'step 2 → step 3', /step\/3/.test(page.url()), page.url());

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const t3 = await page.locator('main').innerText();
  record(id, 'D-L5 step 3 (address) copy mentions no unbuilt feature', !UNBUILT.test(t3), t3.match(UNBUILT)?.[0] ?? '');
  const tb = page.getByRole('textbox');
  await tb.nth(0).fill('Shop 4, Laxmi Road');
  await tb.nth(2).fill('Pune');
  await tb.nth(4).fill('411030');
  await page.locator('input[type="tel"], input[name="phone"]').first().fill('9876543210').catch(() => {});
  await shot(page, `onb-${LANG}-step3-filled`);
  // Reload on step 3 BEFORE continuing: unsaved typing is lost (expected), step must stay 3.
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  record(id, 'reload on step 3 (unsaved): stays on step/3', /step\/3/.test(page.url()), page.url());
  await tb.nth(0).fill('Shop 4, Laxmi Road');
  await tb.nth(2).fill('Pune');
  await tb.nth(4).fill('411030');
  await page.locator('input[name="phone"]').first().fill('9876543210').catch(() => {});
  await page.getByRole('button', { name: T[LANG].cont }).click();
  await page.waitForURL(/step\/4/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  record(id, 'step 3 → step 4', /step\/4/.test(page.url()), page.url());

  // ── Step 4: reload, summary copy, back to step 3 prefilled ───────────────
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  record(id, 'reload on step 4: stays on step/4', /step\/4/.test(page.url()), page.url());
  const t4 = await page.locator('main').innerText();
  await shot(page, `onb-${LANG}-step4-summary`);
  record(id, 'D-L5 summary: no Bill due / Favourite units / Extra expense / Stock rows, no unbuilt promises', !UNBUILT.test(t4) && !/Bill due|Favourite units|Extra expense|बिल की मियाद|पसंदीदा इकाइयाँ|अतिरिक्त खर्च/.test(t4), t4.replace(/\s+/g, ' ').slice(0, 500));
  await page.getByRole('button', { name: T[LANG].back }).first().click();
  await page.waitForURL(/step\/3/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const l1 = await page.getByRole('textbox').nth(0).inputValue();
  const pin = await page.getByRole('textbox').nth(4).inputValue();
  record(id, 'Back to step 3 after reload: saved address prefilled', l1 === 'Shop 4, Laxmi Road' && pin === '411030', `line1="${l1}" pin="${pin}"`);
  await page.getByRole('button', { name: T[LANG].cont }).click();
  await page.waitForURL(/step\/4/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // ── Finish ────────────────────────────────────────────────────────────────
  const finish = page.getByRole('button', { name: T[LANG].finish });
  await finish.click();
  await page.waitForURL(/\/(dashboard|parties)/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  record(id, 'finishing lands on /dashboard (RPT-01 landing) or /parties', ['/dashboard', '/parties'].includes(new URL(page.url()).pathname), page.url());
  await shot(page, `onb-${LANG}-landed-parties`);

  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const switchText = await page.locator('main').innerText();
  await shot(page, `onb-${LANG}-switch`);
  const occurrences = (switchText.match(new RegExp(name2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
  const after = await myTenants(email);
  record(id, 'exactly ONE business: /switch and GET /auth/me', after.length === 1 && after[0].onboarding_step === 4 && after[0].name === name2, `api=${JSON.stringify(after.map((t) => [t.name, t.onboarding_step]))} switch occurrences=${occurrences} :: ${switchText.replace(/\s+/g, ' ').slice(0, 300)}`);
  record(id, 'no 5xx / console errors during the wizard', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
async function phaseT(browser) {
  const id = 'T';
  const email = USER;
  const before = await myTenants(email);
  record(id, 'precondition: no business', before.length === 0, JSON.stringify(before));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage();
  await signIn(a, email);
  const b = await ctx.newPage();
  await b.goto(`${FE}/onboarding/step/1`, { waitUntil: 'networkidle' }); await b.waitForTimeout(1500);
  const statuses = [];
  for (const p of [a, b]) p.on('response', (r) => { if (/\/api\/v1\/tenants$/.test(r.url()) && r.request().method() === 'POST') statuses.push(r.status()); });
  const fill = async (p, name) => {
    await p.getByRole('textbox').first().fill(name);
    await p.getByRole('combobox').first().click(); await p.waitForTimeout(300);
    await p.keyboard.type('Karna'); await p.waitForTimeout(300);
    await p.getByRole('option', { name: 'Karnataka' }).first().click();
    await p.getByRole('radio').nth(1).click();
  };
  await fill(a, 'Tab A Traders');
  await fill(b, 'Tab B Traders');
  const keys = await Promise.all([a, b].map((p) => p.evaluate(() => localStorage.getItem('ub.onboarding.tenantCreateKey'))));
  await Promise.all([a.getByRole('button', { name: 'Continue' }).click(), b.getByRole('button', { name: 'Continue' }).click()]);
  await Promise.all([a, b].map((p) => p.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {})));
  await sleep(2500);
  await a.screenshot({ path: `${SHOTS}/desktop/onb-twotabs-A-1280.png` });
  await b.screenshot({ path: `${SHOTS}/desktop/onb-twotabs-B-1280.png` });
  const bodyA = await a.locator('main').innerText(); const bodyB = await b.locator('main').innerText();
  const after = await myTenants(email);
  record(id, 'two tabs submit step 1 at once → exactly ONE business', after.length === 1, `POST statuses=${JSON.stringify(statuses)} keys=${JSON.stringify(keys)} tenants=${JSON.stringify(after.map((t) => t.name))}`);
  record(id, 'both tabs reach step 2 without an error banner', /step\/2/.test(a.url()) && /step\/2/.test(b.url()) && !/Could not|went wrong/i.test(bodyA + bodyB), `A=${a.url()} B=${b.url()} :: A="${bodyA.replace(/\s+/g, ' ').slice(0, 200)}" B="${bodyB.replace(/\s+/g, ' ').slice(0, 200)}"`);

  // A stale tab that never saw the create: submit step 1 again from a page that mounted before.
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
/** Staff of another business onboards their OWN; and "Add a business" after completion still creates. */
async function phaseS(browser) {
  const id = 'S';
  const owner = USER; // owner of a COMPLETED business, unlimited seats
  const ownerTok = await login(owner);
  const s = Date.now();
  const staffEmail = `n1staff-ui-${s}@shop.test`;
  const m = await api('POST', '/members', { full_name: 'Farhan Shaikh', email: staffEmail, role: 'staff' }, ownerTok, { 'Idempotency-Key': `s-${s}` });
  const tmp = m.body.data.password;
  let st = await login(staffEmail, tmp);
  await api('POST', '/auth/password/set', { current_password: tmp, new_password: PASSWORD }, st);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, staffEmail);
  record(id, 'staff member signs in to the employer\'s /parties (not the wizard)', /\/parties/.test(page.url()), page.url());
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const add = page.getByRole('button', { name: /Add a business|Add business/i }).first();
  record(id, '/switch offers "Add a business" to staff', (await add.count()) > 0);
  await add.click();
  await page.waitForURL(/onboarding\/step\/1/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const nm = await page.getByRole('textbox').first().inputValue().catch(() => 'ERR');
  await shot(page, 'onb-staff-addbusiness-step1');
  record(id, 'staff "Add a business": step 1 is EMPTY (employer\'s business not resumed)', nm === '', `name="${nm}" url=${page.url()}`);
  await page.getByRole('textbox').first().fill('Farhan Mobile Repairs');
  await page.getByRole('combobox').first().click(); await page.waitForTimeout(300);
  await page.keyboard.type('Guj'); await page.waitForTimeout(300);
  await page.getByRole('option', { name: 'Gujarat' }).first().click();
  await page.getByRole('radio').nth(3).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  record(id, 'staff\'s own business: reload on step 2 stays on step 2', /step\/2/.test(page.url()), page.url());
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.waitForTimeout(1200);
  const nm2 = await page.getByRole('textbox').first().inputValue().catch(() => 'ERR');
  record(id, 'staff\'s own business: step 1 prefilled with THEIR business after reload', nm2 === 'Farhan Mobile Repairs', `name="${nm2}"`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1500);
  let tenants = await myTenants(staffEmail);
  record(id, 'staff now has employer (staff) + own (owner) = 2 memberships, employer untouched', tenants.length === 2 && tenants.some((t) => t.role === 'owner' && t.name === 'Farhan Mobile Repairs') && tenants.some((t) => t.role === 'staff'), JSON.stringify(tenants.map((t) => [t.name, t.role, t.onboarding_step])));
  // Finish own business via the UI
  for (let i = 0; i < 3; i += 1) {
    const btn = page.getByRole('button', { name: /Skip for now|Continue|Start using/ }).last();
    await btn.click().catch(() => {});
    await page.waitForTimeout(1800);
    if (/\/parties/.test(page.url())) break;
  }
  if (!/\/parties/.test(page.url())) { await page.getByRole('button', { name: /Start using/ }).click().catch(() => {}); await page.waitForTimeout(2500); }
  record(id, 'staff finishes own onboarding → /parties', /\/parties/.test(page.url()), page.url());

  // "Add a business" after completion → creates a SECOND own business, step 1 empty.
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Add a business|Add business/i }).first().click();
  await page.waitForURL(/onboarding\/step\/1/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const nm3 = await page.getByRole('textbox').first().inputValue().catch(() => 'ERR');
  record(id, '"Add a business" after completing: step 1 is empty (live shop not loaded into the wizard)', nm3 === '', `name="${nm3}"`);
  await page.getByRole('textbox').first().fill('Farhan Second Shop');
  await page.getByRole('combobox').first().click(); await page.waitForTimeout(300);
  await page.keyboard.type('Guj'); await page.waitForTimeout(300);
  await page.getByRole('option', { name: 'Gujarat' }).first().click();
  await page.getByRole('radio').nth(0).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  tenants = await myTenants(staffEmail);
  record(id, '"Add a business" after completion creates a second own business; first keeps its name', tenants.length === 3 && tenants.some((t) => t.name === 'Farhan Mobile Repairs' && t.onboarding_step === 4) && tenants.some((t) => t.name === 'Farhan Second Shop' && t.onboarding_step === 1), JSON.stringify(tenants.map((t) => [t.name, t.role, t.onboarding_step])));
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await shot(page, 'onb-staff-switch-3-businesses');
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
async function phaseM(browser) {
  const id = 'M';
  const owner = USER;
  const tok = await login(owner);
  const membersBefore = (await api('GET', '/members', null, tok)).body.data;
  const taken = arg('taken') ?? '9845678901';
  for (const vp of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
    const tag = vp.width;
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const posts = [];
    page.on('response', async (r) => { if (/\/api\/v1\/members$/.test(r.url()) && r.request().method() === 'POST') posts.push({ status: r.status(), key: r.request().headers()['idempotency-key'], body: await r.text().catch(() => '') }); });
    await signIn(page, owner);
    await page.goto(`${FE}/settings/team`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Add member/i }).first().click();
    await page.waitForTimeout(800);
    const em = `n2ui-${tag}-${Date.now()}@shop.test`;
    await page.getByLabel(/Full name/i).fill('Kiran Patil');
    await page.getByLabel(/Email address/i).first().fill(em);
    const mobile = page.getByLabel(/Mobile/i).first();
    const spellings = [`+91 ${taken.slice(0, 5)} ${taken.slice(5)}`, taken, `0${taken}`];
    let i = 0;
    for (const sp of spellings) {
      await mobile.fill(sp);
      await page.getByRole('button', { name: /Create login/i }).click();
      await page.waitForTimeout(1800);
      const last = posts.at(-1);
      const dlg = page.getByRole('dialog');
      const open = (await dlg.count()) > 0;
      const dlgText = open ? await dlg.innerText() : '';
      const inv = await mobile.getAttribute('aria-invalid').catch(() => null);
      const desc = await mobile.evaluate((el) => (el.getAttribute('aria-describedby') || '').split(' ').map((x) => document.getElementById(x)?.textContent || '').join(' | ')).catch(() => '');
      const vals = [await page.getByLabel(/Full name/i).inputValue().catch(() => ''), await page.getByLabel(/Email address/i).first().inputValue().catch(() => ''), await mobile.inputValue().catch(() => '')];
      if (i === 0) await shot(page, `team-addmember-mobile-taken`);
      record(id, `${tag}: taken mobile "${sp}" → 400 field error ON the Mobile field, dialog open, values kept`,
        last?.status === 400 && /already used by another login/.test(last.body) && open && inv === 'true' && /already used by another login/.test(desc) && vals[0] === 'Kiran Patil' && vals[1] === em,
        `status=${last?.status} aria-invalid=${inv} describedby="${desc}" vals=${JSON.stringify(vals)} body=${last?.body?.slice(0, 200)} dialogHasMsg=${/already used/.test(dlgText)}`);
      i += 1;
    }
    const k400 = posts.map((p) => p.key);
    await mobile.fill('');
    await page.getByRole('button', { name: /Create login/i }).click();
    await page.waitForTimeout(2500);
    const last = posts.at(-1);
    const pw = await page.getByTestId('credentials-password').inputValue().catch(() => null);
    await shot(page, `team-addmember-blank-mobile-success`);
    record(id, `${tag}: retry with blank mobile → 201 and credentials shown`, last?.status === 201 && Boolean(pw), `status=${last?.status} keys=${JSON.stringify(k400.concat(last?.key))}`);
    await ctx.close();
  }
  const membersAfter = (await api('GET', '/members', null, tok)).body.data;
  const added = membersAfter.filter((x) => !membersBefore.some((y) => y.email === x.email));
  record(id, 'no partial users/memberships: exactly the 2 blank-mobile members were added, both mobile=null', added.length === 2 && added.every((x) => x.mobile === null), JSON.stringify(added.map((x) => [x.email, x.mobile])));
}


// ─────────────────────────────────────────────────────────────────────────────
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
async function seedL(owner) {
  const tok = await login(owner);
  const s = Date.now();
  await api('PATCH', '/tenants/current', { phone: '9876543210', address: { line1: '12 Station Road', city: 'Nashik', pincode: '422001', state_code: '27' } }, tok);
  const mk = async (body, k) => (await api('POST', '/parties', body, tok, { 'Idempotency-Key': `${k}-${s}` })).body.data.id;
  const ramesh = await mk({ name: `Ramesh L ${s % 10000}`, is_customer: true, mobile: `98765${String(s).slice(-5)}`, opening_balance_amount: '2300.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(30) }, 'r');
  const lakshmi = await mk({ name: `Lakshmi L ${s % 10000}`, is_customer: true, mobile: `98764${String(s).slice(-5)}` }, 'l');
  const naidu = [];
  for (let i = 0; i < 5; i += 1) naidu.push(await mk({ name: `Naidu L${i} ${s % 10000}`, is_customer: true, opening_balance_amount: '2300.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(90) }, `n${i}`));
  const zero = await mk({ name: `Zero L ${s % 10000}`, is_customer: true }, 'z');
  return { tok, ramesh, lakshmi, naidu, zero, tag: s % 10000, rameshMobile: `98765${String(s).slice(-5)}` };
}

async function phaseL(browser) {
  const owner = USER;
  const d = await seedL(owner);
  const open = async (vp, hi = false) => {
    const ctx = await browser.newContext({ viewport: vp });
    if (hi) await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
    const page = await ctx.newPage();
    await signIn(page, owner);
    return { ctx, page };
  };
  const PHONE = { width: 360, height: 780 }; const PHONE2 = { width: 390, height: 844 }; const DESK = { width: 1280, height: 800 };

  // ── D-L1 + D-L3: statement letterhead phone, opening row in en and hi, screen and print ──
  for (const [vp, hi] of [[PHONE, false], [DESK, false], [PHONE, true], [DESK, true]]) {
    const tag = `${vp.width}-${hi ? 'hi' : 'en'}`;
    const { ctx, page } = await open(vp, hi);
    await page.goto(`${FE}/parties/${d.ramesh}/statement`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="statement-screen"]', { timeout: 45000 });
    await page.waitForTimeout(1500);
    const screen = await page.locator('[data-testid="statement-screen"]').innerText();
    await shot(page, `statement-screen-${hi ? 'hi' : 'en'}`);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(600);
    const sheet = await page.locator('.ub-print-sheet').innerText();
    const letter = await page.locator('[data-testid="statement-letterhead"]').innerText().catch(() => '');
    await shot(page, `statement-print-${hi ? 'hi' : 'en'}`);
    await page.emulateMedia({ media: 'screen' });
    if (!hi) record('D-L1', `${tag}: printed letterhead phone reads "+91 98765 43210"`, /\+91 98765 43210/.test(letter) && !/\+919876543210/.test(letter), letter.replace(/\s+/g, ' '));
    if (hi) {
      record('D-L3', `${tag}: Hindi statement SCREEN opening row reads "शुरुआती बाकी", no "Opening balance"`, /शुरुआती बाकी/.test(screen) && !/Opening balance/i.test(screen), screen.replace(/\s+/g, ' ').slice(0, 400));
      record('D-L3', `${tag}: Hindi statement PRINT opening row reads "शुरुआती बाकी", no "Opening balance"`, /शुरुआती बाकी/.test(sheet) && !/Opening balance/i.test(sheet), sheet.replace(/\s+/g, ' ').slice(0, 500));
      record('D-L1', `${tag}: Hindi print letterhead phone also grouped`, /\+91 98765 43210/.test(letter), letter.replace(/\s+/g, ' '));
    } else {
      record('D-L3', `${tag}: English control — opening row still "Opening balance"`, /Opening balance/.test(screen) && /Opening balance/.test(sheet), '');
    }
    await ctx.close();
  }

  // ── D-L2: quick search by phone ──
  for (const vp of [PHONE2, DESK]) {
    const { ctx, page } = await open(vp);
    await page.goto(`${FE}/parties`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    let box = page.getByRole('combobox', { name: /Search parties|Search customers/i }).first();
    if (!(await box.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Search/i }).first().click().catch(() => {});
      await page.waitForTimeout(600);
      box = page.getByRole('combobox', { name: /Search/i }).first();
    }
    await box.click().catch(() => {});
    await box.fill(d.rameshMobile);
    await page.waitForTimeout(2200);
    const lb = page.getByRole('listbox').first();
    const txt = (await lb.innerText().catch(() => '')) || (await page.locator('body').innerText());
    await shot(page, 'quicksearch-phone-result');
    const want = `+91 98765 ${d.rameshMobile.slice(5)}`;
    record('D-L2', `${vp.width}: quick-search by phone shows "${want}"`, txt.includes(want) && !txt.includes(`+91${d.rameshMobile}`), (await lb.innerText().catch(() => 'NO LISTBOX')).replace(/\s+/g, ' ').slice(0, 200));
    await ctx.close();
  }

  // ── D-L4: OpeningBalanceDrawer chip "Year start" (en/hi), party form parity ──
  for (const [vp, hi] of [[PHONE2, false], [DESK, false], [DESK, true]]) {
    const { ctx, page } = await open(vp, hi);
    await page.goto(`${FE}/parties/${d.lakshmi}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    const more = page.getByRole('button', { name: hi ? /और|More/ : 'More actions', exact: !hi });
    if (await more.count()) { await more.first().click().catch(() => {}); await page.waitForTimeout(500); }
    await page.getByRole('button', { name: hi ? /शुरुआती बाकी जोड़ें|शुरुआती/ : /Add opening balance/ }).last().click().catch(() => {});
    await page.waitForTimeout(1200);
    const dlg = page.getByRole('dialog').last();
    const t = await dlg.innerText().catch(() => '');
    await shot(page, `opening-drawer-${hi ? 'hi' : 'en'}`);
    record('D-L4', `${vp.width}-${hi ? 'hi' : 'en'}: OpeningBalanceDrawer chip reads "${hi ? 'साल की शुरुआत' : 'Year start'}", no "FY start"`, (hi ? /साल की शुरुआत/.test(t) : /Year start/.test(t)) && !/FY start/.test(t), t.replace(/\s+/g, ' ').slice(0, 300));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(DESK);
    await page.goto(`${FE}/parties`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Add party/ }).first().click(); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Opening balance/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
    const t = await page.getByRole('dialog').last().innerText().catch(() => '');
    await shot(page, 'party-form-opening-chip');
    record('D-L4', 'party form opening chip also reads "Year start" (parity)', /Year start/.test(t) && !/FY start/.test(t), (t.match(/.{0,40}(Year start|FY start).{0,40}/) ?? [''])[0]);
    await ctx.close();
  }

  // ── D-L6: phone archive-blocked sheet — visual order == Tab order; Write off never first/default ──
  let ni = 0;
  for (const vp of [PHONE, PHONE2, DESK]) {
    const { ctx, page } = await open(vp);
    const pid = d.naidu[ni++];
    await page.goto(`${FE}/parties/${pid}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('button', { name: 'Archive' }).last().click();
    const dialog = page.getByRole('dialog').last();
    const focusedOnConfirm = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await dialog.getByRole('button', { name: 'Archive' }).click();
    await dialog.getByText(/still owes you/).waitFor({ timeout: 30000 });
    await page.waitForTimeout(700);
    const initial = await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label'));
    const footerButtons = await dialog.evaluate((el) => {
      const btns = [...el.querySelectorAll('button')].filter((b) => /Cancel|Write off|Record payment/.test(b.textContent || ''));
      return btns.map((b) => { const r = b.getBoundingClientRect(); return { name: b.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y) }; });
    });
    const dom = footerButtons.map((b) => b.name.replace(/ ₹.*/, ''));
    const visual = [...footerButtons].sort((a, b) => (vp.width < 640 ? a.y - b.y : a.x - b.x)).map((b) => b.name.replace(/ ₹.*/, ''));
    // Tab walk: start from the first footer button's predecessor by focusing the dialog body then tabbing.
    const tabSeq = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const n = await page.evaluate(() => (document.activeElement?.textContent || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '').trim());
      tabSeq.push(n.replace(/ ₹.*/, ''));
    }
    const footerTab = tabSeq.filter((n) => /^(Cancel|Write off|Record payment)$/.test(n));
    const firstThree = [];
    for (const n of footerTab) { if (!firstThree.includes(n)) firstThree.push(n); if (firstThree.length === 3) break; }
    await shot(page, 'archive-blocked-sheet');
    const expected = ['Cancel', 'Write off', 'Record payment'];
    record('D-L6', `${vp.width}: blocked footer visual order ${vp.width < 640 ? 'top→bottom' : 'left→right'} = Cancel, Write off, Record payment`, JSON.stringify(visual) === JSON.stringify(expected), `visual=${JSON.stringify(visual)} dom=${JSON.stringify(dom)} coords=${JSON.stringify(footerButtons)}`);
    const ci = tabSeq.indexOf('Cancel');
    const cyclic = ci >= 0 ? tabSeq.slice(ci, ci + 3) : [];
    record('D-L6', `${vp.width}: Tab order through the footer (cyclic, from Cancel) matches the visual order`, JSON.stringify(cyclic) === JSON.stringify(expected), `tab sequence=${JSON.stringify(tabSeq)}`);
    record('D-L6', `${vp.width}: Write off is not the initially focused action`, !/^Write off/.test(initial || ''), `focus on blocked open="${(initial || '').slice(0, 40)}" (confirm step focus="${focusedOnConfirm}")`);
    record('D-L6', `${vp.width}: focus is kept inside the dialog on the swap to blocked, and the FIRST Tab does not land on Write off`, !/^Skip to content/.test(initial || '') && tabSeq[0] !== 'Write off', `activeElement after swap="${(initial || '').slice(0, 40)}" first Tab → "${tabSeq[0]}"`);
    await ctx.close();
  }
  // Spot-check two other dialogs' footers: the plain archive confirm (zero balance) and Add member.
  for (const vp of [PHONE, DESK]) {
    const { ctx, page } = await open(vp);
    await page.goto(`${FE}/parties/${d.zero}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('button', { name: 'Archive' }).last().click();
    await page.waitForTimeout(800);
    const dialog = page.getByRole('dialog').last();
    const fb = await dialog.evaluate((el) => [...el.querySelectorAll('button')].filter((b) => /^(Cancel|Archive)$/.test((b.textContent || '').trim())).map((b) => { const r = b.getBoundingClientRect(); return { name: b.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y) }; }));
    const focus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await shot(page, 'dialog-archive-confirm');
    const ok = vp.width < 640 ? fb.find((b) => b.name === 'Archive')?.y < fb.find((b) => b.name === 'Cancel')?.y : fb.find((b) => b.name === 'Archive')?.x > fb.find((b) => b.name === 'Cancel')?.x;
    record('D-L6', `${vp.width}: unchanged — plain Archive confirm keeps primary ${vp.width < 640 ? 'on top (reversed)' : 'on the right'}, opens on Cancel`, ok && focus === 'Cancel', `${JSON.stringify(fb)} focus="${focus}"`);
    await page.keyboard.press('Escape');
    await page.goto(`${FE}/settings/team`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Add member/i }).first().click(); await page.waitForTimeout(800);
    const dlg2 = page.getByRole('dialog').last();
    const fb2 = await dlg2.evaluate((el) => [...el.querySelectorAll('button')].filter((b) => /^(Cancel|Create login)$/.test((b.textContent || '').trim())).map((b) => { const r = b.getBoundingClientRect(); return { name: b.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y) }; }));
    await shot(page, 'dialog-add-member');
    const ok2 = vp.width < 640 ? fb2.find((b) => b.name === 'Create login')?.y < fb2.find((b) => b.name === 'Cancel')?.y : fb2.find((b) => b.name === 'Create login')?.x > fb2.find((b) => b.name === 'Cancel')?.x;
    record('D-L6', `${vp.width}: unchanged — Add member footer keeps primary ${vp.width < 640 ? 'on top' : 'on the right'}`, ok2, JSON.stringify(fb2));
    await ctx.close();
  }

  // ── D-L7: Clear filters visible at 360 without scrolling the chip strip; follows chips on desktop ──
  for (const vp of [PHONE, PHONE2, DESK]) {
    const { ctx, page } = await open(vp);
    await page.goto(`${FE}/parties`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Owes me' }).first().click(); await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Customers', exact: true }).first().click(); await page.waitForTimeout(1200);
    const clear = page.getByRole('button', { name: /Clear filters/ }).first();
    const bb = await clear.boundingBox();
    const label = await clear.innerText().catch(() => '');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const chipBoxes = await page.evaluate(() => [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), right: Math.round(r.right) }; }));
    const lastChip = await page.evaluate(() => { const g = [...document.querySelectorAll('[role="group"] button')]; const r = g.at(-1)?.getBoundingClientRect(); return r ? Math.round(r.right) : null; });
    await page.screenshot({ path: `${SHOTS}/${vp.width < 768 ? 'phone' : 'desktop'}/partylist-filters-clear-${vp.width}.png` });
    const inView = bb && bb.x >= 0 && bb.x + bb.width <= vp.width && bb.y >= 0 && bb.y + bb.height <= vp.height;
    if (vp.width < 768) record('D-L7', `${vp.width}: "${label}" fully on screen without scrolling the chip strip; no page overflow`, Boolean(inView) && /\(2\)/.test(label) && sw <= vp.width, `box=${JSON.stringify(bb)} scrollWidth=${sw} pressed=${JSON.stringify(chipBoxes)}`);
    else record('D-L7', `${vp.width}: "${label}" follows the last chip (gap < 40px)`, Boolean(bb) && lastChip !== null && bb.x - lastChip >= 0 && bb.x - lastChip < 40, `clear.x=${bb?.x} lastChipRight=${lastChip}`);
    // Tap it: must clear
    await clear.click(); await page.waitForTimeout(1200);
    const still = await page.getByRole('button', { name: /Clear filters/ }).count();
    record('D-L7', `${vp.width}: tapping Clear filters clears them`, still === 0 || !(await page.getByRole('button', { name: /Clear filters/ }).first().isVisible()), `remaining=${still}`);
    await ctx.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const phases = { O: phaseO, T: phaseT, S: phaseS, M: phaseM, L: phaseL };
const browser = await chromium.launch();
try {
  for (const p of PHASES) {
    if (!phases[p]) { console.log(`(phase ${p} lives elsewhere)`); continue; }
    try { await phases[p](browser); } catch (e) { record(p, `phase ${p} crashed`, false, e.stack); }
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
