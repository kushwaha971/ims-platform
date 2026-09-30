// Planning aid (PHASE 1): screenshot each route + dump its controls, so the
// recording scripts use real labels. Output: /home/claude/video/explore/<vp>/
import { chromium } from '/home/claude/repo/e2e/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadAccount } from './seed.mjs';

const FE = process.env.FE ?? 'http://localhost:3000';
const acct = loadAccount(process.argv[2] ?? 'explore');
const which = process.argv[3] ?? 'both';
const ROUTES = (process.argv[4] ?? '/dashboard,/parties,/parties/:ramesh,/ledger/aging,/ledger/reminders,/sales/invoices,/sales/invoices/new,/sales/estimates,/sales/credit-notes,/items,/items/:rice,/stock/low,/stock/summary,/purchases/bills,/purchases/bills/new,/payments,/expenses,/cashbook,/reports,/reports/day-book,/reports/gst-summary,/reports/sales-register,/settings,/settings/profile,/settings/branding,/settings/team,/settings/plan,/settings/data,/settings/activity,/imports').split(',');

const dump = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 3; };
  const out = [];
  for (const e of document.querySelectorAll('button,a[href],input,select,textarea,[role=tab],[role=radio],[role=combobox],[role=menuitem],[data-testid]')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    out.push([e.tagName.toLowerCase(), e.getAttribute('role') ?? '', (e.getAttribute('aria-label') ?? e.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
      e.getAttribute('placeholder') ?? '', e.getAttribute('data-testid') ?? '', e.getAttribute('href') ?? '', e.getAttribute('type') ?? '', `${Math.round(r.x)},${Math.round(r.y)}`].join(' | '));
  }
  return { h1: [...document.querySelectorAll('h1,h2')].map((h) => h.innerText).slice(0, 6), controls: out };
});

const browser = await chromium.launch();
for (const [vp, opts] of Object.entries({
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 },
})) {
  if (which !== 'both' && which !== vp) continue;
  const dir = `/home/claude/video/explore/${vp}`; mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ ...opts, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', acct.email);
  await page.fill('input[type="password"]', acct.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForTimeout(2000);
  const all = {};
  for (const r0 of ROUTES) {
    const r = r0.replace(':ramesh', acct.ids?.parties?.['Ramesh Traders'] ?? '').replace(':rice', acct.ids?.items?.['Basmati Rice 5kg'] ?? '');
    await page.goto(`${FE}${r}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const name = r0.replace(/[/:]+/g, '_').replace(/^_/, '') || 'root';
    await page.screenshot({ path: `${dir}/${name}.png` });
    all[r0] = await dump(page);
  }
  writeFileSync(`${dir}/controls.json`, JSON.stringify(all, null, 1));
  await ctx.close();
}
await browser.close();
console.log('ok');
