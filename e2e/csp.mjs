/**
 * csp.mjs — the app works under the Content-Security-Policy production sends.
 *
 * Production puts nginx in front of the app, and nginx adds the CSP in
 * nginx/conf.d/security-headers.inc. Local runs and every other harness talk to
 * the Next server directly, so nothing exercised the app under that policy —
 * and with `script-src 'self'` it blocked the inline scripts Next.js starts
 * every page with: the login form never became usable and nobody could sign in
 * (production-readiness audit, 9 Oct 2026).
 *
 * This harness reads the policy from that file (so it tests what ships, not a
 * copy), attaches it to every HTML response, and walks a real session: sign in,
 * the list, a khata, a new bill and More on a phone, and the dashboard on a
 * desktop. Any CSP violation, page error or missing screen fails it.
 *
 *   node e2e/csp.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { addParty, newOwner, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const HERE = dirname(fileURLToPath(import.meta.url));
const INC = readFileSync(join(HERE, '..', 'nginx', 'conf.d', 'security-headers.inc'), 'utf8');
const SHIPPED = INC.match(/Content-Security-Policy "([^"]+)"/)?.[1];
if (!SHIPPED) throw new Error('no Content-Security-Policy in nginx/conf.d/security-headers.inc');
// In production nginx serves the API on the SAME origin (/api), so
// `connect-src 'self'` covers it. Locally the API is another origin
// (E2E_BACKEND, :8000), so that one origin is added to connect-src — the only
// difference from the shipped policy, and exactly what nginx's proxy erases.
const API_ORIGIN = new URL(process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1').origin;
const CSP = API_ORIGIN === new URL(FRONTEND).origin ? SHIPPED : SHIPPED.replace("connect-src 'self'", `connect-src 'self' ${API_ORIGIN}`);

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check}${detail ? `\n        ${detail}` : ''}`);
};

const owner = await newOwner({ shop: 'CSP Check Stores', prefix: 'csp' });
const party = await addParty(owner.token, { name: 'Ramesh Traders', mobile: uniqMobile() });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const vp of [
  { id: 'phone', width: 390, height: 844, isMobile: true },
  { id: 'desktop', width: 1280, height: 800, isMobile: false },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
  const page = await ctx.newPage();
  const violations = [];
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text.slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if ((headers['content-type'] ?? '').includes('text/html')) headers['content-security-policy'] = CSP;
    await route.fulfill({ response, headers });
  });

  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  const email = page.locator('input[type="email"]');
  const usable = await email.isVisible({ timeout: 20000 }).catch(() => false);
  record(`${vp.id}: the login form is usable under the production CSP`, usable);
  if (usable) {
    await email.fill(owner.email);
    await page.fill('input[type="password"]', owner.password);
    await page.keyboard.press('Enter');
    const signedIn = await page
      .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    record(`${vp.id}: signing in works`, signedIn, page.url());
    const screens =
      vp.id === 'phone'
        ? [
            ['/customers', 'Ramesh Traders'],
            [`/parties/${party.id}`, 'Ramesh Traders'],
            ['/sales/invoices/new', 'Save draft'],
            ['/more', 'Sign out'],
          ]
        : [['/dashboard', 'Dashboard'], ['/customers', 'Ramesh Traders']];
    for (const [path, text] of screens) {
      await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      const shown = await page.getByText(text).filter({ visible: true }).first().isVisible({ timeout: 20000 }).catch(() => false);
      if (!shown) await page.screenshot({ path: `/tmp/csp-${vp.id}-${path.replace(/\W+/g, '_')}.png` }).catch(() => {});
      record(`${vp.id}: ${path} renders`, shown);
    }
  }
  record(`${vp.id}: no CSP violations`, violations.length === 0, violations.slice(0, 3).join(' | '));
  record(`${vp.id}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
