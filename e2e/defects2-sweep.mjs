#!/usr/bin/env node
/**
 * e2e/defects2-sweep.mjs — visual sweep for the defects-2 retest: Customers list,
 * khata, statement, team and onboarding at 360/768/1280 in en and hi. Measures
 * page overflow (scrollWidth vs innerWidth) and text nodes clipped by their own
 * box; screenshots → /tmp/e2e-shots/defects2/{phone,desktop}/sweep-*.
 *
 *   node e2e/defects2-sweep.mjs --owner=<email with parties> --wizard=<email whose 2nd business is unfinished> --wizardShop="<name>"
 */
import { chromium } from 'playwright';
const FE = 'http://localhost:3000', BE = 'http://localhost:8000/api/v1';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const OWNER = arg('owner'), WIZ = arg('wizard'), WIZSHOP = arg('wizardShop'), PW = 'Dukaan2026x';
const SHOTS = process.env.E2E_SHOTS_DIR ?? '/tmp/e2e-shots/defects2';
const results = [];
const record = (id, check, ok, detail = '') => { results.push({ ok }); console.log(`${ok ? 'ok  ' : 'FAIL'}  [${id}] ${check}${detail ? `\n        ${detail}` : ''}`); };
const api = async (m, p, b, t) => { const r = await fetch(BE + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Client': 'api', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json(); };
const tok = (await api('POST', '/auth/login', { email: OWNER, password: PW })).data.access_token;
const plist = (await api('GET', '/parties?q=Ramesh%20L', null, tok)).data;
const ramesh = plist[0].id;
const measure = (page) => page.evaluate(() => {
  const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
  const clipped = [];
  for (const el of document.querySelectorAll('main *')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only') || (cs.clip && cs.clip !== 'auto') || cs.clipPath.includes('inset(50%')) continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible' && !el.closest('[class*="overflow-x-auto"]')) clipped.push(el.textContent.trim().slice(0, 40));
    if (r.right > iw + 1 && !el.closest('[class*="overflow-x-auto"]') && !el.closest('.ub-print-sheet')) clipped.push(`OFFSCREEN:${el.textContent.trim().slice(0, 30)}@${Math.round(r.right)}`);
  }
  return { sw, iw, clipped: clipped.slice(0, 6) };
});
const browser = await chromium.launch();
for (const lang of ['en', 'hi']) {
  for (const w of [360, 768, 1280]) {
    const dir = w < 768 ? 'phone' : 'desktop';
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 780 : 900 } });
    if (lang === 'hi') await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
    const page = await ctx.newPage();
    await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', OWNER); await page.fill('input[type="password"]', PW);
    await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }); await page.waitForTimeout(2000);
    for (const [name, path, wait] of [['customers', '/parties', 1800], ['khata', `/parties/${ramesh}`, 1800], ['statement', `/parties/${ramesh}/statement`, 1800], ['team', '/settings/team', 1500]]) {
      await page.goto(FE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(wait);
      const m = await measure(page);
      await page.screenshot({ path: `${SHOTS}/${dir}/sweep-${name}-${lang}-${w}.png`, fullPage: true });
      record('SWEEP', `${lang} ${w} ${name}: no horizontal overflow, no clipped text`, m.sw <= m.iw && m.clipped.length === 0, JSON.stringify(m));
    }
    await ctx.close();
    // onboarding
    const c2 = await browser.newContext({ viewport: { width: w, height: w < 768 ? 780 : 900 } });
    if (lang === 'hi') await c2.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
    const p2 = await c2.newPage();
    await p2.goto(`${FE}/login`, { waitUntil: 'networkidle' });
    await p2.fill('input[type="email"]', WIZ); await p2.fill('input[type="password"]', PW);
    await p2.click('button[type="submit"]'); await p2.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }); await p2.waitForTimeout(2000);
    await p2.goto(`${FE}/switch`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1200);
    await p2.getByRole('button', { name: new RegExp(WIZSHOP) }).click().catch(() => {}); await p2.waitForTimeout(3500);
    for (const step of [2, 1]) {
      await p2.goto(`${FE}/onboarding/step/${step}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(2500);
      const m = await measure(p2);
      await p2.screenshot({ path: `${SHOTS}/${dir}/sweep-onboarding-step${step}-${lang}-${w}.png`, fullPage: true });
      record('SWEEP', `${lang} ${w} onboarding step ${step} (url ${new URL(p2.url()).pathname}): no overflow/clipping`, m.sw <= m.iw && m.clipped.length === 0, JSON.stringify(m));
    }
    await c2.close();
  }
}
await browser.close();
const f = results.filter((r) => !r.ok).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
