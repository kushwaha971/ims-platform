/**
 * mobile-look.mjs — the phone sweep for the mobile redesign (docs/mobile-redesign).
 *
 * Photographs the phone screens at 360, 390 and 768, in English and Hindi,
 * light and dark, and MEASURES two things a unit test cannot see:
 *
 *   · the page is never wider than the phone (`scrollWidth` vs the viewport);
 *   · no text node overflows its own box (a word the merchant cannot finish).
 *
 * And it checks the navigation rule: the bottom bar is on every destination
 * screen and on no detail or task screen.
 *
 *   node e2e/mobile-look.mjs --out <dir> [--account <account.json>] [--only a,b]
 *
 * With `--account` it signs in to an existing book (desktop-unchanged.mjs
 * writes one); without, it seeds a fresh one.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { addParty, api, newOwner, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const OUT = arg('--out') ?? '/tmp/e2e-shots/mobile';
const only = arg('--only')?.split(',') ?? null;
mkdirSync(OUT, { recursive: true });
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function seed() {
  const owner = await newOwner({ shop: 'Sharma General Store', name: 'Akash Sharma', prefix: 'mlook' });
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

const accountPath = arg('--account');
const account = accountPath && existsSync(accountPath) ? JSON.parse(readFileSync(accountPath, 'utf8')) : await seed();
writeFileSync(join(OUT, 'account.json'), JSON.stringify(account));

/** [name, path, nav expected] — `nav` is whether the bottom bar should show. */
const SCREENS = [
  ['dashboard', '/dashboard', true],
  ['customers', '/customers', true],
  ['suppliers', '/suppliers', true],
  ['khata', `/parties/${account.party}`, false],
  ['statement', `/parties/${account.party}/statement`, false],
  ['items', '/items', true],
  ['invoices', '/sales/invoices', true],
  ['invoice-new', '/sales/invoices/new', false],
  ['purchase-new', '/purchases/bills/new', false],
  ['estimates', '/sales/estimates', true],
  ['payments', '/payments', true],
  ['expenses', '/expenses', true],
  ['reports', '/reports', true],
  ['aging', '/ledger/aging', true],
  ['settings', '/settings', true],
  ['more', '/more', true],
].filter(([name]) => !only || only.includes(name));

const SIZES = [
  { id: '360', width: 360, height: 780 },
  { id: '390', width: 390, height: 844 },
  { id: '768', width: 768, height: 1024 },
];
const VARIANTS = [
  { id: 'en-light', locale: 'en', theme: 'light' },
  { id: 'hi-light', locale: 'hi', theme: 'light' },
  { id: 'en-dark', locale: 'en', theme: 'dark' },
];

const failures = [];
let shots = 0;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const variant of VARIANTS) {
  for (const size of SIZES) {
    // Hindi and dark only at 390; English light at every size.
    if (variant.id !== 'en-light' && size.id !== '390') continue;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: size.width < 768, hasTouch: true });
    await ctx.addCookies([
      { name: 'ub_locale', value: variant.locale, url: FRONTEND },
      { name: 'ub_theme_choice', value: variant.theme, url: FRONTEND },
    ]);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.fill('input[type="email"]', account.email);
    await page.fill('input[type="password"]', account.password);
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 });
    for (const [name, path, navExpected] of SCREENS) {
      const tag = `${name} @${size.id} ${variant.id}`;
      await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const nav = document.querySelector('[data-ub-bottom-nav]');
        const navShown = !!nav && getComputedStyle(nav).display !== 'none';
        const clipped = Array.from(document.querySelectorAll('main p, main span, main div, main h1, main h2, main h3, main a, main button, [data-ub-bottom-nav] span, header span'))
          .filter((n) => n.children.length === 0 && (n.textContent ?? '').trim())
          .filter((n) => !n.className.toString().includes('sr-only') && !n.closest('.sr-only'))
          // `.ub-hit` widens a small control's tap area with an ::after that
          // counts in scrollWidth; that overhang is not clipped text.
          .filter((n) => !n.classList.contains('ub-hit'))
          .filter((n) => getComputedStyle(n).textOverflow !== 'ellipsis' && n.scrollWidth - n.clientWidth > 1)
          .map((n) => (n.textContent ?? '').trim().slice(0, 40))
          .slice(0, 5);
        return { sw: document.documentElement.scrollWidth, vw: innerWidth, navShown, clipped };
      });
      if (m.sw > m.vw) failures.push(`${tag}: page ${m.sw - m.vw}px wider than the phone`);
      if (m.clipped.length) failures.push(`${tag}: clipped text — ${m.clipped.join(' | ')}`);
      if (size.width < 1024 && m.navShown !== navExpected) failures.push(`${tag}: bottom nav ${m.navShown ? 'shown' : 'missing'}`);
      // The khata's pair is docked at the bottom on a phone and must not also
      // sit under the title: two visible "You gave" buttons is the defect.
      // An editor's Save is docked under the total on a phone, not also in the header.
      if (name.endsWith('-new') && size.width < 1024 && variant.locale === 'en') {
        const save = await page.getByRole('button', { name: /^Save draft$/ }).filter({ visible: true }).count();
        if (save !== 1) failures.push(`${tag}: ${save} visible "Save draft" buttons (want the docked one only)`);
      }
      if (name === 'khata' && size.width < 1024 && variant.locale === 'en') {
        const gave = await page.getByRole('button', { name: /^You gave/ }).filter({ visible: true }).count();
        if (gave !== 1) failures.push(`${tag}: ${gave} visible "You gave" buttons (want the docked one only)`);
      }
      await page.screenshot({ path: join(OUT, `${name}-${size.id}-${variant.id}.png`) });
      shots += 1;
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`mobile-look: ${shots} screens into ${OUT}`);
if (failures.length) {
  console.log(`  ${failures.length} finding(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('  no page wider than the phone, no clipped text, nav where it belongs');
