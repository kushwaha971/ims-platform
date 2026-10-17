#!/usr/bin/env node
/**
 * revamp-shots.mjs — R-DEC-07: every revamp piece is photographed on the live
 * stack, at phone and desktop sizes, in each state it has, before the next
 * piece starts (docs/revamp/11 "Screenshots after each piece").
 *
 *   NODE_PATH=$(npm root -g) node e2e/revamp-shots.mjs --piece=loading
 *
 * Pieces:
 *   loading  F1's route loading views. The navigation's own RSC request is
 *            HELD for 4 s, so the frame captured is the one a merchant on a
 *            slow line stares at between the tap and the new screen, not
 *            whatever happened to be painted when a timer fired. Each case is
 *            shot twice: 300 ms after the tap (the loading view) and once the
 *            new screen has settled (what it hands over to).
 *
 * Writes /tmp/e2e-shots/revamp/<piece>/<width>-<theme>-<case>-<when>.png.
 * Same sign-in and stack as perf-app.mjs (the seed_scale owner).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = require('playwright')); }

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL ?? 'scale@digikhaato.test';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Scale-Run-2026!';
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).slice(n.length + 3);
const PIECE = arg('piece', 'loading');
const DIR = `${process.env.E2E_SHOTS ?? '/tmp/e2e-shots'}/revamp/${PIECE}`;
mkdirSync(DIR, { recursive: true });

const SIZES = {
  320: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  1280: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const failures = [];

async function signedInContext(width, theme) {
  const ctx = await browser.newContext(SIZES[width]);
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`);
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  const host = new URL(FRONTEND).hostname;
  await ctx.addCookies([{ name: 'ub_theme_choice', value: theme, domain: host, path: '/' }]);
  await page.close();
  return ctx;
}

/** The navigation's server payload (RSC, not a prefetch) waits `ms` before it is sent. */
async function holdNavigation(page, ms) {
  await page.route('**/*', async (route) => {
    const h = route.request().headers();
    const isNav = h.rsc === '1' && !h['next-router-prefetch'] && !h['next-router-segment-prefetch'];
    if (isNav) await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

// What a merchant taps, per case: start screen, what to tap, the path it should
// reach, a name. The tap is a real click on what is visible, so the router —
// and whether it prefetched the loading view — behaves as it does for a person.
// `link` cases are next/link; `button` cases navigate with router.push (H2).
const link = (href) => (page) => page.locator(`a[href="${href}"]`).filter({ visible: true }).first();
const button = (name) => (page) => page.getByRole('button', { name }).filter({ visible: true }).first();
const ONLY = arg('cases', '').split(',').filter(Boolean);
const ALL_CASES = [
  ['/dashboard', link('/customers'), '^/customers$', 'list'],
  ['/customers', link('/dashboard'), '^/dashboard$', 'home'],
  ['/sales/invoices', button(/^New bill$/), '^/sales/invoices/new$', 'form-button'],
  ['/customers', (page) => (page.viewportSize().width < 1024
    ? page.locator('main button').filter({ hasText: /C-0\d{5}/ }).filter({ visible: true }).first()
    : page.locator('main tr[data-testid="ub-grid-row"] button:not([role="checkbox"])').filter({ visible: true }).first()),
  '^/parties/[^/]+$', 'detail-row'],
  ['/library', link('/library/members'), '^/library/members$', 'library-list'],
  ['/lending', link('/lending/loans'), '^/lending/loans$', 'lending-list'],
];
const CASES = ONLY.length ? ALL_CASES.filter((c) => ONLY.includes(c[3])) : ALL_CASES;

async function measureOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

const WIDTHS = arg('widths', '390,320,1280').split(',').map(Number);
const THEMES = arg('themes', 'light,dark').split(',');
for (const width of WIDTHS) {
  for (const theme of THEMES) {
    if (width === 320 && theme === 'dark') continue;
    const ctx = await signedInContext(width, theme);
    for (const [start, tap, target, name] of CASES) {
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND}${start}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500); // let next/link prefetch the loading view
      await holdNavigation(page, 4000);
      const control = tap(page);
      const file = `${DIR}/${width}-${theme}-${name}`;
      if (!(await control.count())) { failures.push(`${width} ${theme} ${name}: nothing to tap on ${start}`); await page.close(); continue; }
      const t0 = Date.now();
      await control.click({ noWaitAfter: true });
      await page.waitForTimeout(300);
      const busy = await page.locator('[aria-busy="true"]').count();
      await page.screenshot({ path: `${file}-1-loading.png` });
      const over1 = await measureOverflow(page);
      const re = new RegExp(target);
      await page.waitForURL((u) => re.test(u.pathname), { timeout: 20_000 }).catch(() => {});
      // Settled = the held payload has landed and no loading view is left.
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${file}-2-settled.png` });
      const over2 = await measureOverflow(page);
      const reached = re.test(new URL(page.url()).pathname);
      const line = `${width} ${theme} ${name}: loading view at 300 ms ${busy ? 'YES' : 'NO'} · reached ${reached ? 'yes' : 'NO'} · sideways scroll ${over1}/${over2} px · ${Date.now() - t0} ms`;
      console.log(line);
      if (!busy || !reached) failures.push(line);
      if (over1 > 0 || over2 > 0) failures.push(`${line} — page wider than the screen`);
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(failures.length ? `\nFAIL ${failures.length}\n${failures.join('\n')}` : '\nall cases showed the loading view');
process.exit(failures.length ? 1 : 0);
