// Screenshots of the YourKhata rebrand on a live stack: sign-in, the app
// header's mark, the dashboard, and the sidebar, at phone and desktop.
// Usage: node e2e/brand-shots.mjs   (writes /tmp/e2e-shots/brand/live/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { newOwner } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = '/tmp/e2e-shots/brand/live';
mkdirSync(OUT, { recursive: true });

const owner = await newOwner({ shop: 'Sharma Kirana Store', name: 'Rajesh Sharma', prefix: 'brand' });
const browser = await chromium.launch();
for (const [label, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${FE}/login`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${label}-01-login.png` });
  await page.getByLabel(/email/i).fill(owner.email);
  await page.locator('input[type="password"]').fill(owner.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard|parties/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${label}-02-dashboard.png` });
  const title = await page.title();
  const html = await page.content();
  console.log(label, 'title:', title, '| mentions DigiKhaato:', /digikhaato/i.test(html));
  await ctx.close();
}
await browser.close();
