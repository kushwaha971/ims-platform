/**
 * desktop-unchanged.mjs — proves the mobile layer did not move desktop.
 *
 * The mobile redesign (docs/mobile-redesign/06 §2) lives below `lg`; at 1024 px
 * and up every route must render exactly as it did. A unit test cannot see
 * that, so this harness photographs the desktop screens and compares them
 * pixel by pixel against a baseline taken from the build BEFORE the change.
 *
 *   node e2e/desktop-unchanged.mjs --capture <dir>   # on the old build
 *   node e2e/desktop-unchanged.mjs --compare <dir>   # on the new build
 *
 * `--capture` seeds one book and records its sign-in in <dir>/account.json, so
 * `--compare` photographs the SAME data; relative times ("Updated just now")
 * are masked. No dependency: two PNGs are compared on a canvas in the browser.
 * A screen whose pixels differ by more than `TOLERANCE` fails with its name and
 * the count, and the new image is written beside the old one for a look.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { addParty, api, newOwner, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const mode = process.argv.includes('--compare') ? 'compare' : 'capture';
const dir = process.argv[process.argv.indexOf(`--${mode}`) + 1];
if (!dir || dir.startsWith('--')) throw new Error('usage: --capture <dir> | --compare <dir>');
mkdirSync(dir, { recursive: true });
// A pixel or two of anti-aliasing is not a layout change; a moved control is thousands.
const TOLERANCE = 40;
const SIZES = [
  { id: '1280', width: 1280, height: 800 },
  { id: '1440', width: 1440, height: 900 },
];
const SCHEMES = ['light', 'dark'];
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function seed() {
  const owner = await newOwner({ shop: 'Desktop Check Stores', name: 'Desk Owner', prefix: 'desk' });
  const ids = [];
  for (const [i, name] of ['Ramesh Traders', 'Sunita Devi', 'Gupta Kirana', 'Mohan Lal'].entries()) {
    const party = await addParty(owner.token, {
      name,
      mobile: uniqMobile(),
      opening_balance_amount: `${500 + i * 700}.00`,
      opening_balance_direction: i % 2 ? 'credit' : 'debit',
      opening_balance_as_of: daysAgo(40),
    });
    ids.push(party.id);
  }
  for (let k = 0; k < 4; k += 1) {
    await api('POST', `/parties/${ids[0]}/ledger-entries`, { direction: 'debit', amount: `${200 + k * 100}.00`, entry_date: daysAgo(k + 2), note: `Rice ${k + 1}` }, owner.token);
  }
  await api('POST', '/items', { name: 'Basmati Rice 5kg', sale_price: '450.00', item_type: 'goods' }, owner.token);
  return { email: owner.email, password: owner.password, party: ids[0] };
}

const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const allRoutes = (a) => [
  ['dashboard', '/dashboard'],
  ['customers', '/customers'],
  ['suppliers', '/suppliers'],
  ['khata', `/parties/${a.party}`],
  ['statement', `/parties/${a.party}/statement`],
  ['tags', '/parties/tags'],
  ['aging', '/ledger/aging'],
  ['reminders', '/ledger/reminders'],
  ['items', '/items'],
  ['stock', '/stock/summary'],
  ['invoices', '/sales/invoices'],
  ['invoice-new', '/sales/invoices/new'],
  ['estimates', '/sales/estimates'],
  ['purchases', '/purchases/bills'],
  ['purchase-new', '/purchases/bills/new'],
  ['expenses', '/expenses'],
  ['payments', '/payments'],
  ['cashbook', '/cashbook'],
  ['reports', '/reports'],
  ['settings', '/settings'],
  ['team', '/settings/team'],
];
const routes = (a) => allRoutes(a).filter(([name]) => !ONLY || ONLY.includes(name));

/** Count differing pixels between two PNG files, in the page (no image library). */
async function diff(page, a, b) {
  const toUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  return page.evaluate(
    async ([x, y]) => {
      const load = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return Number.MAX_SAFE_INTEGER;
      const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const da = px(ia), db = px(ib);
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n += 1;
      return n;
    },
    [toUrl(a), toUrl(b)]
  );
}

const accountFile = join(dir, 'account.json');
const account = mode === 'capture' || !existsSync(accountFile) ? await seed() : JSON.parse(readFileSync(accountFile, 'utf8'));
if (mode === 'capture') writeFileSync(accountFile, JSON.stringify(account));

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const failures = [];
let checked = 0;
for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme, reducedMotion: 'reduce' });
    // The app's theme is a cookie choice (`ub_theme_choice`, read before first paint), not the OS setting.
    await ctx.addCookies([{ name: 'ub_theme_choice', value: scheme, url: FRONTEND }]);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.fill('input[type="email"]', account.email);
    await page.fill('input[type="password"]', account.password);
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
    for (const [name, path] of routes(account)) {
      await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(900);
      const file = `${name}-${size.id}-${scheme}`;
      const target = join(dir, mode === 'capture' ? `${file}.png` : `${file}.new.png`);
      // Relative times and today's clock are not layout; mask them.
      const mask = [page.locator('time'), page.getByText(/just now|ago|Updated/i)];
      await page.screenshot({ path: target, fullPage: true, animations: 'disabled', caret: 'hide', mask });
      checked += 1;
      if (mode === 'compare') {
        const changed = await diff(page, join(dir, `${file}.png`), target);
        if (changed > TOLERANCE) failures.push(`${file}: ${changed === Number.MAX_SAFE_INTEGER ? 'page size changed' : `${changed} pixels`}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
if (mode === 'capture') console.log(`desktop-unchanged: captured ${checked} screens into ${dir}`);
else if (failures.length) { console.log(`desktop-unchanged: ${failures.length} of ${checked} screens CHANGED\n  ${failures.join('\n  ')}`); process.exit(1); }
else console.log(`desktop-unchanged: ${checked} screens identical`);
