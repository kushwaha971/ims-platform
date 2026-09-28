#!/usr/bin/env node
/**
 * e2e/defects3-qa.mjs — independent QA of the round-2 fix batch (H1, L5–L9,
 * M2–M4), against the LIVE stack. Accounts are passed in (register_ip budget).
 *
 *   node e2e/defects3-qa.mjs --only=P  --owner=<email> [--wizard=<email with a resumable unfinished business>]
 *   node e2e/defects3-qa.mjs --only=R4 --owner=<email whose unfinished business has staff/books>
 *   node e2e/defects3-qa.mjs --only=R4HI --owner=<hindi owner with only complete businesses>
 *   node e2e/defects3-qa.mjs --only=CORNER --user=<staff of an unfinished business who owns a safe unfinished one> --password=...
 *   node e2e/defects3-qa.mjs --only=SW --owner=<email with 2+ businesses>
 *   node e2e/defects3-qa.mjs --only=L7,L8 --owner=<email: complete default + safe unfinished>
 *   node e2e/defects3-qa.mjs --only=HI --owner=<email> --taken=<national number held by another login>
 *
 * Screenshots → /tmp/e2e-shots/defects3/{phone,desktop}.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const FE = 'http://localhost:3000';
const BE = 'http://localhost:8000/api/v1';
const SHOTS = process.env.E2E_SHOTS_DIR ?? '/tmp/e2e-shots/defects3';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const PHASES = (arg('only') ?? 'P').split(',');
const OWNER = arg('owner');
const PW = arg('password') ?? 'Dukaan2026x';
mkdirSync(`${SHOTS}/phone`, { recursive: true });
mkdirSync(`${SHOTS}/desktop`, { recursive: true });

const results = [];
const record = (id, check, ok, detail = '') => {
  results.push({ id, check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  [${id}] ${check}${detail ? `\n        ${String(detail).slice(0, 700)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name, full = true) => {
  const w = page.viewportSize().width;
  await page.screenshot({ path: `${SHOTS}/${w < 768 ? 'phone' : 'desktop'}/${name}-${w}.png`, fullPage: full });
};
const api = async (method, path, body, token, extra = {}) => {
  const r = await fetch(`${BE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Client': 'api', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
};
const login = async (email, password = PW) => (await api('POST', '/auth/login', { email, password })).body.data.access_token;
const tenantsOf = async (email, password = PW) => (await api('GET', '/auth/me', null, await login(email, password))).body.data.tenants;
const resumableOf = async (email, password = PW) => (await api('GET', '/tenants/resumable', null, await login(email, password)));

async function session(browser, email, vp, { hi = false, password = PW, clipboard = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, ...(clipboard ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
  if (hi) await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
  const page = await ctx.newPage();
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { ctx, page };
}
/** Collects every snackbar/alert text that ever appears, so a flash is not missed. */
async function watchSnacks(page) {
  const seen = [];
  await page.exposeFunction(`__snack${Math.floor(Math.random() * 1e9)}`, () => {}).catch(() => {});
  const poll = setInterval(async () => {
    try {
      const t = await page.locator('[role="status"], [role="alert"]').allInnerTexts();
      for (const x of t.map((s) => s.trim()).filter(Boolean)) if (!seen.includes(x)) seen.push(x);
    } catch { /* page closing */ }
  }, 100);
  return { seen, stop: () => clearInterval(poll) };
}

// ─── H1: UbPhoneInput in every place it is used ─────────────────────────────
const VARIANTS = ['+91 98456 78901', '+919845678901', '09845678901', '98456 78901', '0091 98456 78901'];
async function exerciseField(page, field, where, id = 'H1') {
  // key by key
  await field.click(); await field.fill('');
  await field.pressSequentially('9845612345', { delay: 60 });
  const typed = await field.inputValue();
  record(id, `${where}: typing 9845612345 key by key shows 9845612345`, typed === '9845612345', `got "${typed}"`);
  await field.press('End'); await field.pressSequentially('7', { delay: 60 });
  const eleventh = await field.inputValue();
  record(id, `${where}: an 11th digit is refused`, eleventh === '9845612345', `got "${eleventh}"`);
  await field.fill(''); await field.pressSequentially('98456', { delay: 60 });
  const partial = await field.inputValue();
  record(id, `${where}: a partial 98456 stays 98456 (no stray 91)`, partial === '98456', `got "${partial}"`);
  // paste (real clipboard) and autofill-like fill
  const pasteOut = []; const fillOut = [];
  for (const v of VARIANTS) {
    await field.fill('');
    await page.evaluate((t) => navigator.clipboard.writeText(t), v);
    await field.focus(); await page.keyboard.press('Control+V'); await page.waitForTimeout(150);
    pasteOut.push([v, await field.inputValue()]);
    await field.fill(''); await field.fill(v); await page.waitForTimeout(100);
    fillOut.push([v, await field.inputValue()]);
  }
  record(id, `${where}: PASTE of every spelling → 9845678901`, pasteOut.every(([, o]) => o === '9845678901'), JSON.stringify(pasteOut));
  record(id, `${where}: AUTOFILL-style set of every spelling → 9845678901`, fillOut.every(([, o]) => o === '9845678901'), JSON.stringify(fillOut));
  await field.fill('');
}

async function phaseP(browser) {
  for (const vp of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
    const { ctx, page } = await session(browser, OWNER, vp, { clipboard: true });
    // party form: mobile + alt phone
    await page.goto(`${FE}/parties`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Add party/ }).first().click(); await page.waitForTimeout(1500);
    const dlg = page.getByRole('dialog').last();
    await exerciseField(page, dlg.locator('input[type="tel"]').first(), `${vp.width} party form mobile`);
    await dlg.getByRole('button', { name: /More details/ }).click().catch(() => {});
    await page.waitForTimeout(500);
    const tels = await dlg.locator('input[type="tel"]').count();
    if (tels >= 2) await exerciseField(page, dlg.locator('input[type="tel"]').nth(1), `${vp.width} party form alt phone`);
    else record('H1', `${vp.width} party form alt phone field found`, false, `tel inputs=${tels}`);
    // save a party using a pasted spelling, then read back from the API
    await dlg.getByRole('textbox').first().fill(`H1 Paste ${Date.now() % 100000}`);
    const mob = dlg.locator('input[type="tel"]').first();
    const unique = `9${String(Date.now()).slice(-9)}`;
    await page.evaluate((t) => navigator.clipboard.writeText(t), `+91 ${unique.slice(0, 5)} ${unique.slice(5)}`);
    await mob.fill(''); await mob.focus(); await page.keyboard.press('Control+V'); await page.waitForTimeout(200);
    let body = null;
    page.on('request', (r) => { if (/\/api\/v1\/parties$/.test(r.url()) && r.method() === 'POST') body = r.postData(); });
    await dlg.getByRole('button', { name: /Save party/ }).click(); await page.waitForTimeout(2500);
    record('H1', `${vp.width} party saved from a pasted "+91 xxxxx xxxxx" sends mobile "+91${unique}"`, Boolean(body) && JSON.parse(body).mobile === `+91${unique}`, String(body).slice(0, 200));
    await shot(page, 'h1-party-form');
    // team add member
    await page.goto(`${FE}/settings/team`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Add member/i }).first().click(); await page.waitForTimeout(800);
    await exerciseField(page, page.getByRole('dialog').last().locator('input[type="tel"]').first(), `${vp.width} team add member`);
    await shot(page, 'h1-team-dialog');
    await ctx.close();
  }
  const wiz = arg('wizard');
  if (wiz) {
    for (const vp of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
      const { ctx, page } = await session(browser, wiz, vp, { clipboard: true });
      // make the unfinished business active through /switch, then open step 3
      await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
      await page.getByRole('button', { name: new RegExp(arg('wizardShop')) }).click().catch(() => {});
      await page.waitForTimeout(3000);
      await page.goto(`${FE}/onboarding/step/3`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
      const f = page.locator('input[type="tel"]').first();
      if (await f.count()) await exerciseField(page, f, `${vp.width} onboarding shop phone (${new URL(page.url()).pathname})`);
      else record('H1', `${vp.width} onboarding shop phone field reachable`, false, page.url());
      await shot(page, 'h1-onboarding-phone');
      await ctx.close();
    }
  }
}

// ─── M2 (+M3 during the wizard): the "Race 4" repro and the safe banner ─────
async function wizardStep1(page, name, state = 'Kerala', typeIndex = 2) {
  await page.getByRole('textbox').first().fill(name);
  await page.getByRole('combobox').first().click(); await page.waitForTimeout(300);
  await page.keyboard.type(state.slice(0, 3)); await page.waitForTimeout(300);
  await page.getByRole('option', { name: state }).first().click();
  await page.getByRole('radio').nth(typeIndex).click();
}
async function phaseR4(browser, hi = false) {
  const id = hi ? 'M2-hi' : 'M2';
  const owner = OWNER;
  const vp = hi ? { width: 1280, height: 800 } : { width: 390, height: 844 };
  const before = await tenantsOf(owner);
  const res0 = await resumableOf(owner);
  const unfinished = before.filter((t) => t.onboarding_step < 4);
  record(id, `GET /tenants/resumable before: ${JSON.stringify(res0.body?.data?.tenant?.name ?? null)} (unfinished=${JSON.stringify(unfinished.map((t) => t.name))})`, res0.status === 200, JSON.stringify(res0.body).slice(0, 200));
  const complete = before.find((t) => t.onboarding_step >= 4);

  const { ctx, page } = await session(browser, owner, vp, { hi });
  const calls = [];
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (/\/api\/v1\/tenants(\/current|\/resumable)?$/.test(p) && r.method() !== 'OPTIONS') calls.push(`${r.method()} ${p}`); });
  const statuses = [];
  page.on('response', (r) => { if (/\/api\/v1\/tenants$/.test(r.url()) && r.request().method() === 'POST') statuses.push(r.status()); });
  const snacks = await watchSnacks(page);

  // Round 1 — whatever the server says is resumable decides the banner.
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: hi ? /नया व्यापार जोड़ें/ : /Add a business/ }).first().click();
  await page.waitForURL(/step\/1/, { timeout: 15000 }); await page.waitForTimeout(2500);
  const bannerRe = hi ? /अधूरा है/ : /unfinished business/i;
  const main1 = await page.locator('main').innerText();
  const expectBanner = Boolean(res0.body?.data?.tenant);
  const name0 = await page.getByRole('textbox').first().inputValue();
  await shot(page, `m2-${hi ? 'hi' : 'en'}-addbusiness-step1-round1`);
  record(id, `round 1: banner ${expectBanner ? 'shown' : 'NOT shown'} (server resumable=${res0.body?.data?.tenant?.name ?? 'null'})`, bannerRe.test(main1) === expectBanner && (expectBanner ? name0 === res0.body.data.tenant.name : name0 === ''), `banner=${bannerRe.test(main1)} name="${name0}"`);
  const newName = `${hi ? 'नई दुकान' : 'Genuinely New Shop'} ${Date.now() % 10000}`;
  await wizardStep1(page, newName, hi ? 'केरल' : 'Kerala');
  const c0 = calls.length;
  await page.getByRole('button', { name: hi ? 'आगे बढ़ें' : 'Continue' }).click();
  await page.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(2000);
  const r1calls = calls.slice(c0);
  let after1 = await tenantsOf(owner);
  record(id, `round 1: Continue sends POST /tenants (never PATCH) → ${expectBanner ? '200 resume' : '201 create'}`, r1calls.includes('POST /api/v1/tenants') && !r1calls.includes('PATCH /api/v1/tenants/current') && statuses.at(-1) === (expectBanner ? 200 : 201), `calls=${JSON.stringify(r1calls)} statuses=${JSON.stringify(statuses)}`);
  const untouched = before.filter((t) => !(expectBanner && t.id === res0.body.data.tenant.id)).every((t) => after1.some((a) => a.id === t.id && a.name === t.name));
  record(id, 'round 1: every other business keeps its name (the business you came from and the unfinished-with-books one)', untouched, JSON.stringify(after1.map((t) => [t.name, t.role, t.onboarding_step])));
  // M3 during Add a business: steps 2 and 3
  await page.getByRole('button', { name: hi ? /अभी छोड़ें/ : /Skip for now/ }).first().click().catch(() => {});
  await page.waitForURL(/step\/3/, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  record('M3', `${hi ? 'hi ' : ''}Add a business steps 2→3 (+reload): no "switched in another tab" message, still on step 3`, !snacks.seen.some((s) => /another tab|दूसरे टैब/.test(s)) && /step\/3/.test(page.url()), `snacks=${JSON.stringify(snacks.seen)} url=${page.url()}`);

  // Round 2 — back in a complete business, Add a business again: the new one is safe → banner + prefill; POST resumes it.
  const created = after1.find((t) => t.name === newName);
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: new RegExp(complete.name) }).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  record('M3', `${hi ? 'hi ' : ''}/switch → ${complete.name}: lands on the landing page, no "another tab" message`, ['/dashboard', '/parties'].includes(new URL(page.url()).pathname) && !snacks.seen.some((s) => /another tab|दूसरे टैब/.test(s)), `url=${page.url()} snacks=${JSON.stringify(snacks.seen)}`);
  const res2 = await resumableOf(owner);
  record(id, 'GET /tenants/resumable now names the business just created (owner only, no books)', res2.body?.data?.tenant?.id === created?.id, JSON.stringify(res2.body?.data?.tenant?.name ?? null));
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: hi ? /नया व्यापार जोड़ें/ : /Add a business/ }).first().click();
  await page.waitForURL(/step\/1/, { timeout: 15000 }); await page.waitForTimeout(2500);
  const main2 = await page.locator('main').innerText();
  const pre = await page.getByRole('textbox').first().inputValue();
  const st = await page.getByRole('combobox').first().innerText();
  const chk = await page.getByRole('radio', { checked: true }).count();
  await shot(page, `m2-${hi ? 'hi' : 'en'}-banner-prefilled`);
  record(id, `round 2: info banner shown${hi ? ' in Hindi' : ''} naming "${newName}", values prefilled`, bannerRe.test(main2) && main2.includes(newName) && pre === newName && chk === 1 && (hi ? /केरल/.test(st) : /Kerala/.test(st)), `name="${pre}" state="${st}" checked=${chk} :: ${main2.replace(/\s+/g, ' ').slice(0, 260)}`);
  if (hi) record('L6/M2-hi', 'banner has no English left in it', !/unfinished|Continuing|details are filled/i.test(main2), '');
  const renamed = `${newName} B`;
  await page.getByRole('textbox').first().fill(renamed);
  const c2 = calls.length; const s2 = statuses.length;
  await page.getByRole('button', { name: hi ? 'आगे बढ़ें' : 'Continue' }).click();
  await page.waitForURL(/step\/\d/, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(2000);
  const r2calls = calls.slice(c2);
  const after2 = await tenantsOf(owner);
  record(id, 'round 2: Continue POSTs /tenants (200, same id), never PATCHes the business you came from', r2calls.includes('POST /api/v1/tenants') && !r2calls.includes('PATCH /api/v1/tenants/current') && statuses.slice(s2)[0] === 200, `calls=${JSON.stringify(r2calls)} statuses=${JSON.stringify(statuses.slice(s2))} url=${page.url()}`);
  record(id, `round 2: "${complete.name}" is not renamed; resumed business renamed; no extra business`, after2.some((t) => t.id === complete.id && t.name === complete.name) && after2.some((t) => t.id === created?.id && t.name === renamed) && after2.length === after1.length, JSON.stringify(after2.map((t) => [t.name, t.onboarding_step])));
  snacks.stop();
  await ctx.close();
}

/** The staff member whose ACTIVE business is someone else's unfinished one, and who owns a safe unfinished one. */
async function phaseCorner(browser) {
  const email = arg('user');
  const res = await resumableOf(email);
  const before = await tenantsOf(email);
  const { ctx, page } = await session(browser, email, { width: 390, height: 844 });
  const statuses = [];
  page.on('response', (r) => { if (/\/api\/v1\/tenants$/.test(r.url()) && r.request().method() === 'POST') statuses.push(r.status()); });
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Add a business/ }).first().click();
  await page.waitForURL(/step\/1/, { timeout: 15000 }); await page.waitForTimeout(2500);
  const main = await page.locator('main').innerText();
  const banner = /unfinished business/i.test(main);
  const nm = await page.getByRole('textbox').first().inputValue();
  await shot(page, 'm2-corner-staff-addbusiness');
  const willResume = Boolean(res.body?.data?.tenant);
  record('M2-corner', `staff of an unfinished employer, owning a safe unfinished "${res.body?.data?.tenant?.name ?? '-'}": step 1 tells them it will be resumed (banner/prefill) when the server will resume it`, !willResume || (banner && nm === res.body.data.tenant.name), `server resumable=${res.body?.data?.tenant?.name ?? null} banner=${banner} name="${nm}" active=${JSON.stringify(before.map((t) => [t.name, t.role, t.onboarding_step]))}`);
  if (willResume && !banner) {
    await wizardStep1(page, `Corner New ${Date.now() % 10000}`, 'Goa', 0);
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(3000);
    const after = await tenantsOf(email);
    record('M2-corner', 'what Continue did', true, `POST statuses=${JSON.stringify(statuses)} after=${JSON.stringify(after.map((t) => [t.name, t.role, t.onboarding_step]))}`);
  }
  await ctx.close();
}

// ─── M3: switching from /switch, same tab and another tab ───────────────────
async function phaseSW(browser) {
  const tenants = await tenantsOf(OWNER);
  for (const vp of [{ width: 360, height: 780 }, { width: 1280, height: 800 }]) {
    const { ctx, page } = await session(browser, OWNER, vp);
    const snacks = await watchSnacks(page);
    const docs = []; page.on('request', (r) => { if (r.resourceType() === 'document') docs.push(new URL(r.url()).pathname); });
    const me = (await page.evaluate(async () => (await fetch('/api/v1/auth/me').catch(() => null))?.status)) ?? null;
    for (const target of tenants.filter((t) => t.onboarding_step >= 4).slice(0, 2)) {
      await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
      const d0 = docs.length; snacks.seen.length = 0;
      const btn = page.getByRole('button', { name: new RegExp(`^${target.name}`) });
      if ((await btn.getAttribute('aria-current').catch(() => null)) === 'true') continue;
      await btn.click();
      await page.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, `m3-switch-${target.name.replace(/\W+/g, '-')}`, false);
      record('M3', `${vp.width}: /switch → "${target.name}" lands on the landing page with no "another tab" warning and no reload`, ['/dashboard', '/parties'].includes(new URL(page.url()).pathname) && !snacks.seen.some((s) => /another tab/.test(s)) && docs.length === d0, `url=${page.url()} snacks=${JSON.stringify(snacks.seen)} docLoads=${JSON.stringify(docs.slice(d0))} me=${me}`);
    }
    snacks.stop();
    await ctx.close();
  }
  // genuine other-tab switch must still warn + reload
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage();
  await a.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await a.fill('input[type="email"]', OWNER); await a.fill('input[type="password"]', PW);
  await a.click('button[type="submit"]'); await a.waitForTimeout(3000);
  await a.goto(`${FE}/ledger/aging`, { waitUntil: 'networkidle' }); await a.waitForTimeout(1500);
  const docsA = []; a.on('request', (r) => { if (r.resourceType() === 'document') docsA.push(r.url()); });
  const snA = await watchSnacks(a);
  const b = await ctx.newPage();
  await b.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await b.waitForTimeout(1200);
  await b.locator('main li button:not([aria-current="true"])').first().click();
  await b.waitForTimeout(3000);
  await a.bringToFront();
  await a.getByRole('link', { name: /^Customers/ }).first().click().catch(() => {});
  await a.waitForTimeout(3500);
  record('M3', 'control: a switch in ANOTHER tab still warns and reloads this tab', snA.seen.some((s) => /another tab/.test(s)) && docsA.length > 0, `snacks=${JSON.stringify(snA.seen)} reloads=${docsA.length}`);
  snA.stop();
  await ctx.close();
}

// ─── L7: progress label while step 2 reloads ────────────────────────────────
async function phaseL7(browser) {
  const tenants = await tenantsOf(OWNER);
  const target = tenants.find((t) => t.onboarding_step >= 1 && t.onboarding_step < 4);
  for (const [vp, hi] of [[{ width: 390, height: 844 }, false], [{ width: 1280, height: 800 }, true]]) {
    const { ctx, page } = await session(browser, OWNER, vp, { hi });
    await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    await page.getByRole('button', { name: new RegExp(`^${target.name}`) }).click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.goto(`${FE}/onboarding/step/2`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
    let slow = true;
    await page.route('**/api/v1/tenants/current', async (route) => { if (slow && route.request().method() === 'GET') await sleep(2500); await route.continue().catch(() => {}); });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200);
    const txt = await page.locator('main').innerText().catch(() => '');
    const skel = await page.locator('[aria-busy="true"], .animate-pulse').count();
    await shot(page, `l7-step2-reload-skeleton-${hi ? 'hi' : 'en'}`, false);
    slow = false;
    const progress = (txt.match(hi ? /4 में से चरण \d/ : /Step \d of 4/) ?? [''])[0];
    const rail = await page.locator('[aria-current="step"]').allInnerTexts().catch(() => []);
    record('L7', `${vp.width}${hi ? ' hi' : ''}: while step 2 reloads (skeleton=${skel}) the progress reads step 2`, skel > 0 && (hi ? /चरण 2/.test(progress) || rail.some((r) => /जीएसटी/.test(r)) : progress === 'Step 2 of 4' || rail.some((r) => /GST/.test(r))), `progress="${progress}" rail-current=${JSON.stringify(rail)} :: ${txt.replace(/\s+/g, ' ').slice(0, 160)}`);
    await page.waitForTimeout(3500);
    await ctx.close();
  }
}

// ─── L8: second tab with identical step-1 values ────────────────────────────
async function phaseL8(browser) {
  const before = await tenantsOf(OWNER);
  const res = await resumableOf(OWNER);
  record('L8', 'precondition: nothing resumable (so both tabs race to CREATE)', !res.body?.data?.tenant, JSON.stringify(res.body?.data?.tenant?.name ?? null));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage();
  await a.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await a.fill('input[type="email"]', OWNER); await a.fill('input[type="password"]', PW);
  await a.click('button[type="submit"]'); await a.waitForTimeout(3000);
  const tabs = [a, await ctx.newPage()];
  const res2 = []; const snaps = [];
  const name = `Twin L8 ${Date.now() % 10000}`;
  for (const p of tabs) {
    p.on('response', async (r) => { if (/\/api\/v1\/tenants$/.test(r.url()) && r.request().method() === 'POST') res2.push(`${r.status()}:${(await r.text().catch(() => '')).match(/"code":"(\w+)"/)?.[1] ?? 'ok'}`); });
    await p.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
    await p.getByRole('button', { name: /Add a business/ }).first().click(); await p.waitForURL(/step\/1/); await p.waitForTimeout(2000);
    await wizardStep1(p, name, 'Goa', 0);
    snaps.push(await watchSnacks(p));
  }
  await Promise.all(tabs.map((p) => p.getByRole('button', { name: 'Continue' }).click()));
  await Promise.all(tabs.map((p) => p.waitForURL(/step\/2/, { timeout: 20000 }).catch(() => {})));
  await sleep(2500);
  for (const [i, p] of tabs.entries()) await p.screenshot({ path: `${SHOTS}/desktop/l8-twotabs-identical-tab${i}-1280.png` });
  const after = await tenantsOf(OWNER);
  record('L8', 'both tabs reach step 2', tabs.every((p) => /step\/2/.test(p.url())), tabs.map((p) => p.url()).join(' '));
  record('L8', 'exactly ONE new business', after.length === before.length + 1 && after.filter((t) => t.name === name).length === 1, `POSTs=${JSON.stringify(res2)} tenants=${JSON.stringify(after.map((t) => t.name))}`);
  record('L8', 'no warning snackbar when the retry succeeds (in_progress retried silently)', !snaps.some((s) => s.seen.some((x) => /another tab/.test(x))), JSON.stringify(snaps.map((s) => s.seen)));
  snaps.forEach((s) => s.stop());
  await ctx.close();
}

// ─── L6: the mobile-taken message in Hindi, and no raw field codes ──────────
async function phaseHI(browser) {
  const taken = arg('taken') ?? '9845678901';
  for (const [vp, hi] of [[{ width: 360, height: 780 }, true], [{ width: 1280, height: 800 }, true], [{ width: 360, height: 780 }, false]]) {
    const { ctx, page } = await session(browser, OWNER, vp, { hi });
    let resp = null;
    page.on('response', async (r) => { if (/\/api\/v1\/members$/.test(r.url()) && r.request().method() === 'POST') resp = { s: r.status(), b: await r.text() }; });
    await page.goto(`${FE}/settings/team`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: hi ? /सदस्य जोड़ें/ : /Add member/ }).first().click(); await page.waitForTimeout(800);
    const dlg = page.getByRole('dialog').last();
    await dlg.getByRole('textbox').nth(0).fill('Kiran Patil');
    await dlg.getByRole('textbox').nth(1).fill(`l6-${vp.width}-${Date.now()}@shop.test`);
    await dlg.locator('input[type="tel"]').first().fill(`+91 ${taken.slice(0, 5)} ${taken.slice(5)}`);
    await dlg.getByRole('button', { name: hi ? /लॉगिन बनाएँ/ : /Create login/ }).click(); await page.waitForTimeout(2000);
    const text = await dlg.innerText();
    const all = await page.locator('body').innerText();
    await shot(page, `l6-mobile-taken-${hi ? 'hi' : 'en'}`);
    const codes = (() => { try { return JSON.stringify(JSON.parse(resp.b).error.field_codes ?? JSON.parse(resp.b).error.details); } catch { return ''; } })();
    const want = hi ? 'यह मोबाइल नंबर किसी दूसरे लॉगिन में पहले से इस्तेमाल हो रहा है' : 'This mobile number is already used by another login';
    record('L6', `${vp.width} ${hi ? 'hi' : 'en'}: taken mobile (typed with +91 and spaces) → message in ${hi ? 'Hindi' : 'English'} under the field`, resp?.s === 400 && text.includes(want) && (!hi || !/already used by another login/.test(all)), `status=${resp?.s} codes=${codes} :: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    record('L6', `${vp.width} ${hi ? 'hi' : 'en'}: no raw field code (mobile_taken / errors.field.*) on screen`, !/mobile_taken|errors\.field|field_codes/.test(all), '');
    await ctx.close();
  }
}

const phases = { P: phaseP, R4: (b) => phaseR4(b, false), R4HI: (b) => phaseR4(b, true), CORNER: phaseCorner, SW: phaseSW, L7: phaseL7, L8: phaseL8, HI: phaseHI };
const browser = await chromium.launch();
try {
  for (const p of PHASES) {
    try { await phases[p](browser); } catch (e) { record(p, `phase ${p} crashed`, false, e.stack); }
  }
} finally { await browser.close(); }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
