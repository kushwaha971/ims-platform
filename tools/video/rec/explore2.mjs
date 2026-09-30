// Planning aid: open the main dialogs/forms and dump their controls + screenshot.
import { chromium } from '/home/claude/repo/e2e/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadAccount } from './seed.mjs';

const FE = 'http://localhost:3000';
const acct = loadAccount('explore');
const vpName = process.argv[2] ?? 'phone';
const dir = `/home/claude/video/explore/${vpName}-dlg`; mkdirSync(dir, { recursive: true });
const opts = vpName === 'phone'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 };
const dump = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const root = [...document.querySelectorAll('[role=dialog]')].filter(vis).pop() ?? document.querySelector('main') ?? document.body;
  return [...root.querySelectorAll('button,a[href],input,select,textarea,[role=tab],[role=radio],[role=option],[role=combobox],[role=switch],[data-testid],label')].filter(vis).map((e) =>
    [e.tagName.toLowerCase(), e.getAttribute('role') ?? '', (e.getAttribute('aria-label') ?? e.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 70), e.getAttribute('placeholder') ?? '', e.getAttribute('data-testid') ?? '', e.getAttribute('type') ?? '', e.getAttribute('name') ?? ''].join(' | '));
});
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...opts, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
await ctx.addInitScript(() => { window.print = () => {}; window.open = (u) => { window.__opened = u; return null; }; });
const page = await ctx.newPage();
await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', acct.email);
await page.fill('input[type="password"]', acct.password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
await page.waitForTimeout(1500);
const out = {};
const step = async (name, fn) => {
  try { await fn(); await page.waitForTimeout(1500); } catch (e) { out[`${name}-error`] = String(e).slice(0, 300); }
  await page.screenshot({ path: `${dir}/${name}.png` });
  out[name] = await dump(page).catch((e) => String(e));
};
const go = async (p) => { await page.goto(`${FE}${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); };
const P = acct.ids.parties;

await go('/parties');
await step('01-add-party', () => page.getByRole('button', { name: /Add party/ }).first().click());
await page.keyboard.press('Escape');
await go(`/parties/${P['Ramesh Traders']}`);
await step('02-you-gave', () => page.getByRole('button', { name: /You gave/ }).first().click());
await page.keyboard.press('Escape');
await go(`/parties/${P['Suresh Kumar']}`);
await step('03-party-with-balance', async () => {});
await step('04-more-actions', () => page.getByRole('button', { name: /More actions/ }).first().click());
await page.keyboard.press('Escape');
await go('/ledger/reminders');
await step('05-reminders-tabs', () => page.getByRole('button', { name: /Late|Next/ }).first().click());
await go('/sales/invoices');
const inv = page.getByRole('button', { name: /Open .*Suresh|Suresh Kumar/ }).first();
await step('06-invoice-detail', () => page.getByText(/INV\/26-27\/0003/).first().click());
await go('/expenses');
await step('07-add-expense', () => page.getByRole('button', { name: /Add expense/ }).first().click());
await page.keyboard.press('Escape');
await go('/payments');
await step('08-record-payment', () => page.getByRole('button', { name: /Record|Add|New|payment/i }).last().click());
await page.keyboard.press('Escape');
await go('/items');
await step('09-add-item', () => page.getByTestId('item-add').click());
await page.keyboard.press('Escape');
await step('10-adjust', () => page.getByRole('button', { name: /Adjust stock/ }).first().click());
await page.keyboard.press('Escape');
await go('/sales/invoices/new');
await step('11-inv-party-radio', () => page.getByRole('radio', { name: 'Party' }).click());
await step('12-account-menu', () => page.getByRole('button', { name: /Account menu/ }).click());
await page.keyboard.press('Escape');
if (vpName === 'phone') await step('13-nav-menu', () => page.getByRole('button', { name: /Open menu/ }).click());
await go('/settings/team');
await step('14-add-member', () => page.getByRole('button', { name: /Add member/ }).first().click());
await page.keyboard.press('Escape');
await go('/sales/estimates/new');
await step('15-estimate-new', async () => {});
await go('/sales/credit-notes/new');
await step('16-credit-note-new', async () => {});
await go('/imports');
await step('17-import-choose', () => page.getByRole('button', { name: 'Choose' }).first().click());
writeFileSync(`${dir}/controls.json`, JSON.stringify(out, null, 1));
await browser.close();
console.log('ok', Object.keys(out).filter((k) => k.endsWith('error')));
