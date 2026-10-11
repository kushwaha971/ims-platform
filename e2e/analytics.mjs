/**
 * e2e/analytics.mjs — what product analytics would send, read off the wire.
 *
 *   E2E_BACKEND=http://127.0.0.1:8100/api/v1 DEMO_API_LOG=<api log> \
 *   DEMO_FRONTEND=http://localhost:3100 node e2e/analytics.mjs
 *
 * Needs a site BUILT with analytics on and a key that belongs to nobody:
 *   NEXT_PUBLIC_ANALYTICS_ENABLED=true NEXT_PUBLIC_POSTHOG_KEY=phc_localcheck_not_a_real_project
 *
 * NOTHING LEAVES THE MACHINE: every request to posthog.com is answered here.
 * The checks are the three rules of DEC-017 (`src/analytics/analyticsRules.ts`)
 * as the network sees them — a unit test can say the SDK was configured to
 * mask; only the payload can say a customer's name is not in it.
 *
 * Three things a headless browser needs before PostHog sends anything at all,
 * each of which looks exactly like "the integration is broken": a real user
 * agent string, no "HeadlessChrome" in `navigator.userAgentData.brands`, and
 * `navigator.webdriver` false. PostHog drops every event from a likely bot,
 * silently — the SDK loads, fetches its config, and captures nothing.
 */
import { chromium } from 'playwright';
import zlib from 'node:zlib';

import { FE, signIn, useBusiness } from './demo/lib.mjs';

if (!/:8100\//.test(process.env.E2E_BACKEND ?? '')) throw new Error('Demo stack only: E2E_BACKEND on :8100.');
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || !detail ? '' : ` — ${detail}`}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' });
await ctx.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  // `userAgentData.brands` names "HeadlessChrome" whatever the user agent string says.
  Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
});
const hits = [];
const decode = (req) => { const buf = req.postDataBuffer(); if (!buf) return ''; try { return zlib.gunzipSync(buf).toString(); } catch { /* not gzip */ } const text = buf.toString(); try { const m = /data=([^&]+)/.exec(text); if (m) return Buffer.from(decodeURIComponent(m[1]), 'base64').toString(); } catch { /* plain */ } return text; };
await ctx.route(/posthog\.com/, async (route) => {
  const req = route.request();
  hits.push({ url: req.url().replace(/\?.*/, ''), body: decode(req) });
  const js = /\.js$/.test(req.url().replace(/\?.*/, ''));
  await route.fulfill({ status: 200, contentType: js ? 'application/javascript' : 'application/json', body: js ? '' : '{"status":1,"featureFlags":{},"sessionRecording":false,"surveys":false}' });
});
const sent = (from = 0) => hits.slice(from).map((h) => h.body).join('\n');
const eventsIn = (text) => [...new Set([...text.matchAll(/"event":"([^"]+)"/g)].map((m) => m[1]))];

const page = await ctx.newPage();
await page.goto(`${FE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
check('the landing page reports a page view', eventsIn(sent()).includes('$pageview'), `events ${eventsIn(sent())}; endpoints ${[...new Set(hits.map((h) => h.url))].length}`);

await signIn(page);
await useBusiness(page, 'Sharma General Store');
const from = hits.length;
await page.goto(`${FE}/customers?q=Ramesh`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByText('Ramesh Traders').first().click().catch(() => {});
await page.waitForTimeout(5000);
const inApp = sent(from);
const urls = [...new Set([...sent().matchAll(/"\$current_url":"([^"]+)"/g)].map((m) => m[1]))];
check('a signed-in screen reports a page view', /"\$pageview"/.test(inApp) && urls.some((u) => u.endsWith('/customers')), urls.join(' '));
check('no reported address carries a query string', urls.every((u) => !u.includes('?')), urls.join(' '));
check('the person is identified', /\$identify/.test(sent()));
const everything = sent();
check('no customer name is in any payload', !/Ramesh Traders|Anita General|Priya Sweets/.test(everything));
check('no mobile number is in any payload', !/9876543210|9822012345|98220 12345/.test(everything));
check("the owner's name is in no payload", !/Ramesh Sharma/.test(everything));
check("the business's name is in no payload", !/Sharma General Store/.test(everything));
check('no balance is in any payload', !/3,?765\.00|7,?039\.00/.test(everything));
check('what was typed in a search is in no payload', !/q=Ramesh/.test(everything));
const clicks = [...new Set([...everything.matchAll(/"\$el_text":"([^"]*)"/g)].map((m) => m[1]))].filter((t) => t && !/^\*+$/.test(t));
check('a click carries no text from the screen', clicks.length === 0, clicks.join(' | '));

// A customer's page and a link with a token in it, in a tab that never loaded the SDK.
const other = await ctx.newPage();
const before = hits.length;
for (const path of ['/d/not-a-real-token', '/pay/not-a-real-token', '/reset-password/tok_123']) {
  await other.goto(`${FE}${path}`, { waitUntil: 'networkidle' });
  await other.waitForTimeout(3500);
}
check("nothing is sent from a customer's bill, the pay page or a reset link", hits.length === before, `${hits.length - before} requests`);
check('the SDK is not even downloaded there', !(await other.evaluate(() => performance.getEntriesByType('resource').some((r) => /posthog/i.test(r.name)))));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
