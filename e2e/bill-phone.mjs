/**
 * e2e/bill-phone.mjs — a bill on a phone stays inside its own sheet.
 *
 *   E2E_BACKEND=http://127.0.0.1:8100/api/v1 DEMO_API_LOG=<api log> \
 *   DEMO_FRONTEND=http://localhost:3100 node e2e/bill-phone.mjs [--shots <dir>]
 *
 * The owner found it in the phone demo film (11 Oct 2026): the HSN-wise tax
 * summary was wider than the cell it sits in, so it ran through the sheet's
 * right-hand rule and "Total tax" was drawn across the border. No test could
 * have seen it: the page itself was not wider than the screen, and every cell
 * had its full text. So this MEASURES — every table on the bill against the
 * inside edge of its own parent — at 360 (the smallest phone the product is
 * built for), 390 and 1280 px, on the demo
 * book's bills (run `e2e/demo/seed-demo.mjs` first).
 *
 * Demo stack only; it refuses any other API.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { FE, signIn, useBusiness } from './demo/lib.mjs';

if (!/:8100\//.test(process.env.E2E_BACKEND ?? '')) throw new Error('Demo stack only: E2E_BACKEND on :8100.');
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`); };

const browser = await chromium.launch();
for (const width of [360, 390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: width < 600, hasTouch: width < 600 });
  const page = await ctx.newPage();
  await signIn(page);
  await useBusiness(page, 'Sharma General Store');
  const list = await (await ctx.request.get('http://localhost:8100/api/v1/sales/invoices')).json();
  check(`${width}px: the demo book has bills to measure`, (list.data ?? []).length > 0);
  for (const invoice of (list.data ?? []).slice(0, 3)) {
    await page.goto(`${FE}/sales/invoices/${invoice.id}`, { waitUntil: 'networkidle' });
    await page.locator('.ub-gst').first().waitFor({ timeout: 20000 });
    const found = await page.evaluate(() => {
      const sheet = document.querySelector('.ub-gst');
      const over = [...sheet.querySelectorAll('table')].map((table) => {
        const parent = table.parentElement;
        const style = getComputedStyle(parent);
        const inside = parent.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
        return { table: table.dataset.testid ?? table.className, by: Math.round(table.getBoundingClientRect().right - inside), scrolls: table.scrollWidth - table.clientWidth };
      });
      return { over, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    const out = found.over.filter((t) => t.by > 0);
    check(`${width}px ${invoice.number}: no table is wider than the box it is in`, out.length === 0, JSON.stringify(out));
    const slid = found.over.filter((t) => t.scrolls > 1);
    check(`${width}px ${invoice.number}: an ordinary bill's tables fit without sliding sideways`, slid.length === 0, JSON.stringify(slid));
    check(`${width}px ${invoice.number}: the page is not wider than the screen`, found.page <= 0, `${found.page}px`);
  }
  if (SHOTS) { await page.getByTestId('print-hsn-summary').scrollIntoViewIfNeeded().catch(() => {}); await page.screenshot({ path: path.join(SHOTS, `bill-${width}.png`) }); }
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
