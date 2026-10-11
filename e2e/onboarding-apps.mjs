/**
 * e2e/onboarding-apps.mjs — a new business chooses what it runs (11 Oct 2026).
 *
 *   E2E_BACKEND=http://127.0.0.1:8100/api/v1 DEMO_API_LOG=<api log> \
 *   DEMO_FRONTEND=http://localhost:3100 node e2e/onboarding-apps.mjs [--shots <dir>]
 *
 * Signs up through the real screens — a mobile number, the code from the API's
 * log (the console OTP provider), the four-step wizard — once per combination
 * of apps and once per screen size, and asserts what the merchant GETS:
 * which apps the session lists, where the wizard lands, which menus are drawn.
 * A tile that lights up is not a business that runs the app, so every check
 * after Finish reads the server's session, not the wizard.
 *
 * Runs against the DEMO stack only (its own database, no SMS is ever sent).
 * It refuses any other API.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const API = process.env.E2E_BACKEND ?? '';
const FE = process.env.DEMO_FRONTEND ?? 'http://localhost:3100';
const LOG = process.env.DEMO_API_LOG;
if (!/:8100\//.test(API) || !LOG) throw new Error('Demo stack only: E2E_BACKEND on :8100 and DEMO_API_LOG are required.');
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`); };

const codeFor = async (mobile, from) => {
  for (let i = 0; i < 40; i += 1) {
    const hits = [...readFileSync(LOG, 'utf8').slice(from).matchAll(/sms\.console to=\+91…(\d{3}) body=(\d{4,6}) is your/g)].filter((m) => m[1] === mobile.slice(-3));
    if (hits.length) return hits.at(-1)[2];
    await sleep(300);
  }
  throw new Error('no OTP in the demo API log');
};

const HOME = { shop: '/dashboard', library: '/library', lending: '/lending' };
const NAME = { shop: 'Shop', library: 'Library', lending: 'Lending' };
const SCENARIOS = [
  { id: 'shop-only', apps: ['shop'], business: 'Gupta Traders' },
  { id: 'library-only', apps: ['library'], business: 'Gyan Reading Room' },
  { id: 'lending-only', apps: ['lending'], business: 'Shree Finance' },
  { id: 'library-and-lending', apps: ['library', 'lending'], business: 'Sagar Classes' },
  { id: 'all-three', apps: ['shop', 'library', 'lending'], business: 'Om Enterprises' },
];
const DEVICES = [
  { name: 'desktop', context: { viewport: { width: 1280, height: 800 } } },
  { name: 'phone', context: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } },
];

/** Nothing may be wider than the screen it is on (the lesson of LED-02). */
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Text cut off inside its own box: the "Rename" that rendered as "e". */
const clipped = (page) => page.evaluate(() => [...document.querySelectorAll('[role="checkbox"] span, [role="radio"] span, button')]
  .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && el.textContent.trim())
  .map((el) => el.textContent.trim().slice(0, 40)));

const browser = await chromium.launch();
let serial = Number(String(Date.now()).slice(-4)) % 800 + 100;

for (const device of DEVICES) {
  for (const sc of SCENARIOS) {
    const tag = `${sc.id} · ${device.name}`;
    serial += 1;
    const mobile = `98111${String(serial).padStart(5, '0')}`.slice(0, 10);
    const ctx = await browser.newContext({ ...device.context, locale: 'en-IN' });
    const page = await ctx.newPage();
    const shot = async (label) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${sc.id}-${device.name}-${label}.png`), fullPage: true }); };
    try {
      // ── Sign up: a mobile number and a code ────────────────────────────────
      await page.goto(`${FE}/signup`, { waitUntil: 'networkidle' });
      const field = page.getByLabel(/Mobile number/).first();
      await field.click();
      await field.pressSequentially(mobile);
      const from = readFileSync(LOG, 'utf8').length;
      await page.getByRole('button', { name: /Send code/ }).click();
      await page.getByRole('heading', { name: /Enter the code|code/i }).waitFor({ timeout: 30000 });
      await page.getByRole('textbox').first().focus();
      await page.keyboard.type(await codeFor(mobile, from));
      await page.waitForURL(/\/onboarding\/step\/1/, { timeout: 60000 });

      // ── Step 1: every released app is offered, none is ticked ──────────────
      const group = page.getByRole('group', { name: 'What do you want to use?' });
      await group.waitFor({ timeout: 30000 });
      const offered = await group.getByRole('checkbox').allInnerTexts();
      check(`${tag}: Shop, Library and Lending are all offered at sign-up`, ['Shop', 'Library', 'Lending'].every((n) => offered.some((o) => o.startsWith(n))), offered.join(' | '));
      check(`${tag}: no hidden app (Gym, Hotel) is offered`, !offered.some((o) => /Gym|Hotel/i.test(o)), offered.join(' | '));
      check(`${tag}: nothing is ticked for the merchant`, (await group.locator('[aria-checked="true"]').count()) === 0);
      check(`${tag}: the shop question is not asked before the Shop is chosen`, (await page.getByRole('radiogroup').count()) === 0);
      check(`${tag}: step 1 fits the screen`, (await overflow(page)) <= 0, `${await overflow(page)}px wider`);
      const cut = await clipped(page);
      check(`${tag}: no tile text is cut off`, cut.length === 0, cut.join(' | '));
      await shot('1-empty');

      // Continue with nothing chosen is refused on the field.
      await page.getByLabel(/Business name/).fill(sc.business);
      if (await page.getByLabel(/Your name/).count()) await page.getByLabel(/Your name/).fill('Asha Verma');
      await page.getByRole('combobox', { name: /State/ }).click();
      await page.getByPlaceholder(/Search/).fill('Maha');
      await page.getByRole('option', { name: /Maharashtra/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      check(`${tag}: continuing with nothing chosen is refused`, await page.getByText('Choose at least one').isVisible().catch(() => false));

      for (const app of sc.apps) await group.getByRole('checkbox', { name: new RegExp(`^${NAME[app]}`) }).click();
      const asksShop = (await page.getByRole('radiogroup').count()) === 1;
      check(`${tag}: the shop question appears exactly when the Shop is chosen`, asksShop === sc.apps.includes('shop'));
      if (asksShop) await page.getByRole('radio', { name: /Retail shop/ }).click();
      check(`${tag}: step 1 still fits with the choice made`, (await overflow(page)) <= 0, `${await overflow(page)}px wider`);
      await shot('2-chosen');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForURL(/\/onboarding\/step\/2/, { timeout: 30000 });

      // ── Steps 2 and 3 skipped, as most first-time owners do ────────────────
      await page.getByRole('button', { name: /Skip/ }).click();
      await page.waitForURL(/\/onboarding\/step\/3/, { timeout: 30000 });
      await page.getByRole('button', { name: /Skip/ }).click();
      await page.waitForURL(/\/onboarding\/step\/4/, { timeout: 30000 });

      // ── Step 4 says the choice back ────────────────────────────────────────
      await page.getByText('You will use').waitFor({ timeout: 30000 });
      const summary = await page.getByRole('main').innerText();
      check(`${tag}: the last step names every chosen app`, sc.apps.every((a) => summary.includes(NAME[a])), summary.slice(0, 200));
      check(`${tag}: the last step shows shop defaults only for a shop`, /Business type/.test(summary) === sc.apps.includes('shop'));
      check(`${tag}: step 4 fits the screen`, (await overflow(page)) <= 0);
      await shot('3-summary');
      await page.getByRole('button', { name: /Start using|Finish/ }).click();
      await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 60000 });
      await page.waitForLoadState('networkidle').catch(() => {});

      // ── What the merchant actually got: the server's session ───────────────
      const me = await (await ctx.request.get(`${API.replace('127.0.0.1', 'localhost')}/auth/me`)).json();
      const running = (me.data.apps ?? []).map((a) => a.code).sort();
      const addable = (me.data.apps_addable ?? []).map((a) => a.code).sort();
      check(`${tag}: the business runs exactly what was chosen`, JSON.stringify(running) === JSON.stringify([...sc.apps].sort()), `runs ${running}`);
      const others = ['shop', 'library', 'lending'].filter((a) => !sc.apps.includes(a)).sort();
      check(`${tag}: every app not chosen can still be added later`, others.every((a) => addable.includes(a)), `addable ${addable}`);
      const modules = me.data.enabled_modules ?? [];
      if (!sc.apps.includes('shop')) check(`${tag}: no shop capability was switched on`, !modules.some((m) => ['sales', 'purchases', 'inventory'].includes(m)), modules.join(','));
      const landed = new URL(page.url()).pathname;
      check(`${tag}: setup lands in a chosen app (${landed})`, sc.apps.some((a) => landed === HOME[a] || landed.startsWith(`${HOME[a]}/`)), landed);
      const failed = await page.getByText(/Something went wrong|not available|No access/i).count();
      check(`${tag}: the first screen opens without an error`, failed === 0);
      check(`${tag}: the first screen fits`, (await overflow(page)) <= 0, `${await overflow(page)}px wider`);
      await shot('4-landed');

      // ── A page of an app that was not chosen is not served ─────────────────
      if (!sc.apps.includes('shop')) {
        const res = await ctx.request.get(`${API.replace('127.0.0.1', 'localhost')}/sales/invoices`);
        check(`${tag}: the shop's bills are refused for a business without the Shop (${res.status()})`, res.status() === 403 || res.status() === 404);
      }
      if (!sc.apps.includes('library')) {
        const res = await ctx.request.get(`${API.replace('127.0.0.1', 'localhost')}/library/members`);
        check(`${tag}: the library is refused for a business without it (${res.status()})`, res.status() === 403 || res.status() === 404);
      }
    } catch (error) {
      check(`${tag}: the journey completes`, false, String(error.message).split('\n')[0]);
      await shot('error');
    }
    await ctx.close();
  }
}
await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
