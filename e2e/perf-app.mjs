#!/usr/bin/env node
/**
 * perf-app.mjs — the app routes' client-side performance, measured, against a
 * LIVE standalone stack (`./e2e/serve-api.sh && ./e2e/serve.sh`). Phase 1 of
 * the revamp (docs/revamp/05-feedback-and-performance.md §6): measure, do not
 * fix. Modelled on `landing.mjs --perf`, which measures only `/`.
 *
 * What it records, at 390×844 (mobile emulation, touch) and 1280×800, on each
 * profile (unthrottled, and 4× CPU + 1.6 Mbps / 150 ms RTT through CDP):
 *
 *   1. NAVIGATIONS — for ~10 taps a merchant makes every day (bottom-nav tabs
 *      or sidebar rows, a list row into the person page, the app switcher),
 *      timed from the input event inside the page:
 *        firstChange  first DOM mutation in <body> after pointerdown
 *                     (script/link/style insertions excluded), then the frame
 *                     after it (double rAF) — "the first visible change";
 *        url          when location.pathname became the target;
 *        content      the last mutation in <main> before 800 ms of quiet with
 *                     no loading indicator and the target path reached;
 *        loadingUi    whether any skeleton/progress/aria-busy element appeared
 *                     between the tap and the content (and when);
 *        prefetched   RSC requests for the target started BEFORE the tap,
 *                     versus RSC + API requests started after it;
 *        longTasks    long tasks (> 50 ms) between tap and content;
 *        interaction  the Event Timing duration of the tap (INP sample).
 *   2. COLD OPENS of /dashboard, /sales/invoices, /items and /khata in a
 *      fresh context (empty HTTP cache): LCP, CLS, long tasks, JS bytes, and
 *      the API waterfall — in particular whether the page's first data
 *      request starts only after GET /auth/me has answered.
 *   3. PRESSED STATE — computed style of a tab, a list row and two buttons,
 *      150 ms into a mouse press (CDP touch does not set :active headless),
 *      versus the resting look and the hover look.
 *   4. LONG LISTS — DOM node and row counts on the members, loans and
 *      customers lists of a seeded book.
 *
 * Usage:
 *   NODE_PATH=$(npm root -g) node e2e/perf-app.mjs [--reps=3] [--only=nav,cold,press,lists]
 *       [--widths=390,1280] [--profiles=unthrottled,throttled] [--out=file.json] [--shots]
 *
 * Sign-in: E2E_EMAIL / E2E_PASSWORD (default: the `manage.py seed_scale`
 * owner). The book must have the Shop, Udhaar book, Library and Lending apps
 * switched on; the 17 Oct 2026 run did that through POST /tenants/current/apps.
 *
 * Chromium: CHROME (default /opt/pw-browsers/chromium).
 * A lab number from a container is not a phone. Read the dated report
 * (docs/performance/2026-10-17-app-baseline.md) for what that means.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // The cloud workspace has Playwright only as a global package; ESM ignores
  // NODE_PATH, CommonJS resolution honours it.
  ({ chromium } = require('playwright'));
}

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL ?? 'scale@digikhaato.test';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Scale-Run-2026!';
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const REPS = Number(arg('reps', '3'));
const ONLY = arg('only', 'nav,cold,press,lists').split(',');
const WIDTHS = arg('widths', '390,1280').split(',').map(Number);
const PROFILE_NAMES = arg('profiles', 'unthrottled,throttled').split(',');
const OUT = arg('out', `/tmp/claude-0/perf-app-${new Date().toISOString().slice(0, 10)}.json`);
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = `${process.env.E2E_SHOTS ?? '/tmp/e2e-shots'}/perf-app`;
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

const PROFILES = {
  unthrottled: { name: 'unthrottled', network: null, cpu: 1 },
  throttled: {
    name: 'throttled',
    // 1.6 Mbps down = 200,000 B/s; ~750 kbps up; 150 ms RTT; 4× CPU. Same as landing.mjs.
    network: { latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 },
    cpu: 4,
  },
};
const VIEWPORTS = {
  390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  1280: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const results = { date: new Date().toISOString(), frontend: FRONTEND, reps: REPS, nav: [], cold: [], press: [], lists: [] };
const log = (...a) => console.log(...a);
const r0 = (n) => (n == null ? null : Math.round(n));

// ── page instrumentation ─────────────────────────────────────────────────────
// Installed before any page script; observers are buffered, so first-load
// entries are kept. Everything is in the page's performance.now() clock.
const INIT = () => {
  const P = (window.__perf = { lcp: 0, lcpEl: '', cls: 0, shifts: [], longtasks: [], events: [] });
  const safe = (fn) => { try { fn(); } catch { /* unsupported entry type */ } };
  safe(() => new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      P.lcp = e.startTime;
      P.lcpEl = e.element ? `${e.element.tagName.toLowerCase()}${e.element.id ? `#${e.element.id}` : ''} "${(e.element.innerText || '').slice(0, 40)}"` : '';
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true }));
  safe(() => new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) { P.cls += e.value; P.shifts.push({ t: e.startTime, v: e.value }); }
  }).observe({ type: 'layout-shift', buffered: true }));
  safe(() => new PerformanceObserver((l) => {
    for (const e of l.getEntries()) P.longtasks.push({ t: e.startTime, d: e.duration });
  }).observe({ type: 'longtask', buffered: true }));
  safe(() => new PerformanceObserver((l) => {
    for (const e of l.getEntries()) P.events.push({ n: e.name, t: e.startTime, d: e.duration, id: e.interactionId, ps: e.processingStart, pe: e.processingEnd });
  }).observe({ type: 'event', durationThreshold: 16, buffered: true }));

  // Navigation probe: armed by window.__arm(targetRegexSource).
  window.__arm = (target) => {
    const N = (window.__nav = {
      target, from: location.pathname, t0: null, firstMut: null, firstMutWhat: '', firstPaint: null,
      urlAt: null, lastMainMut: null, loadingAt: null, loadingWhat: '', mainMuts: 0,
    });
    const re = new RegExp(target);
    const LOADING = '[aria-busy="true"], [role="progressbar"], .animate-pulse, [data-loading="true"]';
    // A determinate progressbar (aria-valuenow) is a meter, not a loading
    // indicator; anything already on screen before the tap is the old page's.
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.hasAttribute('aria-valuenow') && !pre.has(el); };
    const pre = new Set(document.querySelectorAll(LOADING));
    document.addEventListener('pointerdown', () => { if (N.t0 == null) N.t0 = performance.now(); }, { capture: true });
    const ignored = (node) => node && node.nodeType === 1 && /^(SCRIPT|LINK|STYLE|META|NOSCRIPT|TEMPLATE)$/.test(node.tagName);
    const mo = new MutationObserver((records) => {
      if (N.t0 == null) return;
      const now = performance.now();
      for (const rec of records) {
        const t = rec.target;
        if (!document.body.contains(t) && t !== document.body) continue;
        if (rec.type === 'childList' && [...rec.addedNodes, ...rec.removedNodes].every(ignored)) continue;
        // Playwright's screenshot (--shots) touches the focused field's
        // attributes to hide the caret; that is not the app answering a tap.
        if (rec.type === 'attributes' && /^(INPUT|TEXTAREA)$/.test(t.tagName)) continue;
        if (N.firstMut == null) {
          N.firstMut = now;
          const added = [...rec.addedNodes].find((n) => !ignored(n));
          const desc = (n) => (n && n.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${n.getAttribute('role') ? `[role=${n.getAttribute('role')}]` : ''}${n.getAttribute('aria-label') ? ` "${n.getAttribute('aria-label').slice(0, 30)}"` : ''}${typeof n.className === 'string' && n.className ? ` .${n.className.split(' ').slice(0, 3).join('.')}` : ''}` : n ? '#text' : '');
          N.firstMutWhat = `${rec.type} ${desc(t)}${rec.attributeName ? `[${rec.attributeName}]` : ''}${added ? ` +${desc(added)}` : ''}`;
          requestAnimationFrame(() => requestAnimationFrame(() => { N.firstPaint = performance.now(); }));
        }
        const main = document.querySelector('main');
        if (main && (main.contains(t) || t.contains?.(main))) { N.lastMainMut = now; N.mainMuts += 1; }
      }
      if (N.loadingAt == null) {
        const hit = [...document.querySelectorAll(LOADING)].find(visible);
        if (hit) { N.loadingAt = now; N.loadingWhat = `${hit.tagName.toLowerCase()}${hit.getAttribute('aria-label') ? ` "${hit.getAttribute('aria-label').slice(0, 30)}"` : ''}`; }
      }
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      if (N.urlAt == null && N.t0 != null && re.test(location.pathname)) N.urlAt = performance.now();
      requestAnimationFrame(tick);
    };
    tick();
    window.__navState = () => {
      const busy = [...document.querySelectorAll(LOADING)].some(visible);
      return { ...N, now: performance.now(), busy, path: location.pathname };
    };
  };
};

async function throttle(page, profile) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.network) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  return cdp;
}

/** Record every request the page starts, with wall-clock time and whether it was an RSC/prefetch. */
function trackRequests(page) {
  const list = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    const h = req.headers();
    list.push({
      at: Date.now(), path: url.pathname, search: url.search, type: req.resourceType(), method: req.method(),
      rsc: url.searchParams.has('_rsc') || h.rsc === '1',
      prefetch: h['next-router-prefetch'] === '1' || 'next-router-segment-prefetch' in h,
      req,
    });
  });
  page.on('requestfinished', (req) => { const e = list.find((x) => x.req === req); if (e) e.end = Date.now(); });
  page.on('requestfailed', (req) => { const e = list.find((x) => x.req === req); if (e) { e.end = Date.now(); e.failed = true; } });
  return list;
}

/** Wait until no request has started for `quiet` ms and none is in flight (polls count as in flight briefly). */
async function settle(page, reqs, { quiet = 1500, max = 45_000 } = {}) {
  const start = Date.now();
  for (;;) {
    const last = reqs.length ? Math.max(...reqs.map((r) => r.end ?? r.at)) : start;
    const inflight = reqs.filter((r) => !r.end && Date.now() - r.at < 20_000).length;
    if (!inflight && Date.now() - last > quiet) return;
    if (Date.now() - start > max) return;
    await page.waitForTimeout(200);
  }
}

async function signIn(vp) {
  const ctx = await browser.newContext(VIEWPORTS[vp]);
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`);
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

// ── 1. navigations ───────────────────────────────────────────────────────────
const navLink = (href) => (page) => page.locator(`nav a[href="${href}"]`).filter({ visible: true }).first();
const mainLink = (href) => (page) => page.locator(`main a[href="${href}"]`).filter({ visible: true }).first();
const customerRow = (vp) => (page) => (vp === 390
  ? page.locator('main button').filter({ hasText: /C-0\d{5}/ }).filter({ visible: true }).first()
  : page.locator('main tr[data-testid="ub-grid-row"] button:not([role="checkbox"])').filter({ visible: true }).first());

function navigations(vp) {
  const phone = vp === 390;
  const list = [
    { id: 'shop.home→customers', start: '/dashboard', target: '^/customers$', tap: navLink('/customers'), kind: phone ? 'bottom tab' : 'sidebar row' },
    { id: 'shop.customers→bills', start: '/customers', target: '^/sales/invoices$', tap: navLink('/sales/invoices'), kind: phone ? 'bottom tab' : 'sidebar row' },
  ];
  if (phone) {
    list.push({ id: 'shop.bills→more', start: '/sales/invoices', target: '^/more$', tap: navLink('/more'), kind: 'bottom tab' });
    list.push({ id: 'shop.more→items', start: '/more', target: '^/items$', tap: mainLink('/items'), kind: 'More row (link)' });
  } else {
    list.push({ id: 'shop.bills→items', start: '/sales/invoices', target: '^/items$', tap: navLink('/items'), kind: 'sidebar row' });
  }
  list.push(
    { id: 'shop.customer row→person', start: '/customers', target: '^/parties/[0-9a-f-]{36}$', tap: customerRow(vp), kind: 'list row (router.push)' },
    {
      id: 'switcher→Udhaar /khata', start: '/dashboard', target: '^/khata$', kind: 'app switcher item (router.push)',
      before: async (page) => {
        await page.getByRole('button', { name: /Change business/ }).filter({ visible: true }).first().click();
        await page.getByRole('menuitem', { name: 'Udhaar book' }).waitFor();
        await page.waitForTimeout(800);
      },
      tap: (page) => page.getByRole('menuitem', { name: 'Udhaar book' }),
    },
    { id: 'khata.people→aging', start: '/khata', target: '^/ledger/aging$', tap: navLink('/ledger/aging'), kind: phone ? 'bottom tab' : 'sidebar row' },
    { id: 'library.home→members', start: '/library', target: '^/library/members$', tap: navLink('/library/members'), kind: phone ? 'bottom tab' : 'sidebar row' },
    { id: 'library.members→seats', start: '/library/members', target: '^/library/seats$', tap: navLink('/library/seats'), kind: phone ? 'bottom tab' : 'sidebar row' },
    { id: 'lending.today→loans', start: '/lending', target: '^/lending/loans$', tap: navLink('/lending/loans'), kind: phone ? 'bottom tab' : 'sidebar row' },
  );
  return list;
}

async function measureNav(page, reqs, nav, vp, profile, rep) {
  const from = reqs.length; // only this navigation's own history counts
  await page.goto(`${FRONTEND}${nav.start}`, { waitUntil: 'load', timeout: 90_000 });
  await settle(page, reqs);
  if (nav.before) await nav.before(page);
  await settle(page, reqs, { quiet: 1000 });
  const targetRe = new RegExp(nav.target);
  const prefetchedBefore = reqs.slice(from).filter((r) => r.rsc && targetRe.test(r.path)).length;
  await page.evaluate((t) => window.__arm(t), nav.target);
  const el = nav.tap(page);
  await el.waitFor({ state: 'visible', timeout: 20_000 });
  await el.scrollIntoViewIfNeeded();
  const tapWall = Date.now();
  if (vp === 390) await el.tap({ noWaitAfter: true }); else await el.click({ noWaitAfter: true });
  let shotAfterTap = null;
  if (SHOTS) {
    shotAfterTap = `${SHOT_DIR}/${vp}-${profile.name}-${nav.id.replace(/[^\w]+/g, '_')}-tap.png`;
    await page.screenshot({ path: shotAfterTap }).catch(() => null);
  }
  // wait for content: target path, no loading UI, <main> quiet for 800 ms
  let st;
  const deadline = Date.now() + 60_000;
  for (;;) {
    st = await page.evaluate(() => window.__navState?.()).catch(() => null);
    if (st && st.urlAt != null && !st.busy && st.lastMainMut != null && st.now - st.lastMainMut > 800) break;
    if (Date.now() > deadline) { st = { ...(st ?? {}), timedOut: true }; break; }
    await page.waitForTimeout(100);
  }
  const contentWall = Date.now();
  const after = reqs.filter((r) => r.at >= tapWall && r.at <= contentWall);
  // The navigation's own RSC request (not a prefetch): when it left and came
  // back, on the Node clock relative to the tap.
  const navRsc = after.find((r) => r.rsc && !r.prefetch && targetRe.test(r.path));
  const perf = await page.evaluate(() => window.__perf);
  const t0 = st.t0;
  const contentAt = st.lastMainMut;
  const longs = perf.longtasks.filter((l) => l.t >= t0 - 5 && l.t <= contentAt);
  const ev = perf.events.filter((e) => e.t >= t0 - 50 && e.t <= t0 + 2000 && e.id);
  const interaction = ev.length ? Math.max(...ev.map((e) => e.d)) : null;
  const row = {
    vp, profile: profile.name, rep, id: nav.id, kind: nav.kind,
    firstChange: r0(st.firstMut - t0), firstChangeWhat: st.firstMutWhat, firstPaint: r0(st.firstPaint - t0),
    url: r0(st.urlAt - t0), content: r0(contentAt - t0),
    loadingUi: st.loadingAt != null ? r0(st.loadingAt - t0) : null, loadingWhat: st.loadingWhat,
    prefetchedBefore,
    rscAfter: after.filter((r) => r.rsc && !r.prefetch).length,
    prefetchAfter: after.filter((r) => r.rsc && r.prefetch).length,
    navRsc: navRsc ? { start: navRsc.at - tapWall, end: navRsc.end ? navRsc.end - tapWall : null } : null,
    apiAfter: after.filter((r) => r.path.startsWith('/api/')).map((r) => r.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')),
    jsAfter: after.filter((r) => r.type === 'script').length,
    // Route JavaScript fetched only after the tap: when the last of it arrived.
    jsAfterLastEnd: (() => { const js = after.filter((r) => r.type === 'script' && r.end); return js.length ? Math.max(...js.map((r) => r.end)) - tapWall : null; })(),
    longTasks: longs.length, longTaskMax: r0(longs.length ? Math.max(...longs.map((l) => l.d)) : 0),
    interaction: r0(interaction), timedOut: !!st.timedOut, shotAfterTap,
  };
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${vp}-${profile.name}-${nav.id.replace(/[^\w]+/g, '_')}-done.png` }).catch(() => null);
  return row;
}

// ── 2. cold opens ────────────────────────────────────────────────────────────
async function coldOpen(state, vp, profile, route) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], storageState: state });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await throttle(page, profile);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const net = new Map();
  let docStart = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    const u = new URL(e.request.url);
    if (docStart == null && e.type === 'Document') docStart = e.timestamp;
    net.set(e.requestId, { path: u.pathname, search: u.search, type: e.type, start: e.timestamp, bytes: 0 });
  });
  cdp.on('Network.loadingFinished', (e) => { const n = net.get(e.requestId); if (n) { n.end = e.timestamp; n.bytes = e.encodedDataLength; } });
  const reqs = trackRequests(page);
  await page.goto(`${FRONTEND}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await settle(page, reqs, { quiet: 2000, max: 90_000 });
  const nt = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  const perf = await page.evaluate(() => window.__perf);
  const ms = (t) => (t == null || docStart == null ? null : Math.round((t - docStart) * 1000));
  const api = [...net.values()].filter((n) => n.path.startsWith('/api/')).sort((a, b) => a.start - b.start)
    .map((n) => ({ path: n.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id') + (n.search.length > 60 ? `${n.search.slice(0, 60)}…` : n.search), start: ms(n.start), end: ms(n.end) }));
  const me = api.find((a) => a.path.startsWith('/api/v1/auth/me'));
  const SESSIONISH = /\/api\/v1\/(auth\/|notifications\/unread-count|system\/)/;
  const firstData = api.find((a) => !SESSIONISH.test(a.path));
  const js = [...net.values()].filter((n) => n.type === 'Script').reduce((s, n) => s + n.bytes, 0);
  const longs = perf.longtasks;
  const row = {
    vp, profile: profile.name, route, landed: new URL(page.url()).pathname,
    ttfb: r0(nt.ttfb), dcl: r0(nt.dcl), lcp: r0(perf.lcp), lcpEl: perf.lcpEl, cls: Number(perf.cls.toFixed(4)),
    longTasks: longs.length, longTaskMax: r0(longs.length ? Math.max(...longs.map((l) => l.d)) : 0),
    longTaskSum: r0(longs.reduce((s, l) => s + l.d, 0)),
    jsKB: Number((js / 1024).toFixed(1)),
    authMe: me ? { start: me.start, end: me.end } : null,
    firstData: firstData ?? null,
    dataWaitsForMe: me && firstData ? firstData.start >= me.end : null,
    api,
  };
  await ctx.close();
  return row;
}

// ── 3. pressed state ─────────────────────────────────────────────────────────
async function pressed(page, locator) {
  // CDP touch events do not set :active in headless Chromium (calibrated on
  // 17 Oct 2026 with an injected `#calib:active { background: red }` button:
  // no change at 50/120/300/600 ms). So the press is a MOUSE press at the
  // same layout, which does set :active, and it is compared with both the
  // resting look (what a finger sees: touch has no hover) and the hover look.
  const el = locator;
  await el.waitFor({ state: 'visible', timeout: 20_000 });
  await el.scrollIntoViewIfNeeded();
  const read = () => el.evaluate((node) => {
    const pick = (n) => { const s = getComputedStyle(n); return [s.backgroundColor, s.color, s.transform, s.opacity, s.boxShadow, s.filter].join('|'); };
    return [node, ...node.querySelectorAll('*')].slice(0, 6).map(pick);
  });
  const box = await el.boundingBox();
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.mouse.move(1, 1); await page.waitForTimeout(250);
  const rest = await read();
  await page.mouse.move(x, y); await page.waitForTimeout(250);
  const hover = await read();
  await page.mouse.down(); await page.waitForTimeout(150);
  const press = await read();
  await page.mouse.move(1, 1); await page.mouse.up();
  const diff = (a, b) => a.map((v, i) => v !== b[i]).filter(Boolean).length;
  return { changedFromRest: diff(rest, press), changedFromHover: diff(hover, press), rest: rest[0], hover: hover[0], press: press[0] };
}

// ── 4. long lists ────────────────────────────────────────────────────────────
async function listShape(page, path) {
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(800);
  const count = () => page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    rowsTr: document.querySelectorAll('main tr[data-testid="ub-grid-row"], main tbody tr').length,
    rowButtons: [...document.querySelectorAll('main button')].filter((b) => /\d{5}|LN-\d|C-\d|M-\d/.test(b.innerText)).length,
    mainButtons: document.querySelectorAll('main button').length,
    pager: !!document.querySelector('main nav[aria-label*="agin" i], main [data-testid*="pagination" i], main button[aria-label*="Next" i]'),
  }));
  const first = await count();
  for (let i = 0; i < 3; i += 1) { await page.mouse.wheel(0, 20_000); await page.waitForTimeout(1200); }
  const scrolled = await count();
  return { path, first, scrolled };
}

// ── run ──────────────────────────────────────────────────────────────────────
for (const vp of WIDTHS) {
  log(`\n=== ${vp}px — signing in as ${EMAIL}`);
  const state = await signIn(vp);
  for (const pname of PROFILE_NAMES) {
    const profile = PROFILES[pname];
    if (ONLY.includes('cold')) {
      for (const route of ['/dashboard', '/sales/invoices', '/items', '/khata']) {
        const row = await coldOpen(state, vp, profile, route);
        results.cold.push(row);
        log(`cold  ${vp} ${pname} ${route}: TTFB ${row.ttfb} · LCP ${row.lcp} · CLS ${row.cls} · long tasks ${row.longTasks} (max ${row.longTaskMax}, sum ${row.longTaskSum}) · JS ${row.jsKB} KB · /auth/me ${row.authMe?.start}→${row.authMe?.end} · first data ${row.firstData?.path} @${row.firstData?.start} · waits=${row.dataWaitsForMe}`);
      }
    }
    if (ONLY.includes('nav')) {
      const ctx = await browser.newContext({ ...VIEWPORTS[vp], storageState: state });
      await ctx.addInitScript(INIT);
      const page = await ctx.newPage();
      await throttle(page, profile);
      const reqs = trackRequests(page);
      for (let rep = 1; rep <= REPS; rep += 1) {
        for (const nav of navigations(vp)) {
          try {
            const row = await measureNav(page, reqs, nav, vp, profile, rep);
            results.nav.push(row);
            log(`nav   ${vp} ${pname} r${rep} ${nav.id}: first change ${row.firstChange} (${row.firstChangeWhat}) · url ${row.url} · content ${row.content} · loading UI ${row.loadingUi ?? 'none'} · prefetched ${row.prefetchedBefore} · nav RSC ${row.navRsc ? `${row.navRsc.start}→${row.navRsc.end}` : 'none'} · js done ${row.jsAfterLastEnd} · after: rsc ${row.rscAfter} (+${row.prefetchAfter} prefetch), api ${row.apiAfter.length}, js ${row.jsAfter} · long ${row.longTasks}/${row.longTaskMax} · inp ${row.interaction}${row.timedOut ? ' TIMEOUT' : ''}`);
          } catch (e) {
            results.nav.push({ vp, profile: pname, rep, id: nav.id, error: e.message.slice(0, 200), at: page.url() });
            await page.screenshot({ path: `/tmp/claude-0/perf-app-error-${vp}-${pname}-${nav.id.replace(/[^\w]+/g, '_')}.png` }).catch(() => null);
            log(`nav   ${vp} ${pname} r${rep} ${nav.id}: ERROR ${e.message.slice(0, 160)}`);
          }
        }
      }
      await ctx.close();
    }
  }
  if (ONLY.includes('press')) {
    const ctx = await browser.newContext({ ...VIEWPORTS[vp], storageState: state });
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/customers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const targets = [
      ['nav tab/row (Bills)', navLink('/sales/invoices')(page)],
      ['list row (customer)', customerRow(vp)(page)],
      ['primary button (Add customer)', page.getByRole('button', { name: 'Add customer' }).filter({ visible: true }).first()],
      ['secondary button (Sort / Export)', page.getByRole('button', { name: vp === 390 ? 'Sort' : 'Export' }).filter({ visible: true }).first()],
    ];
    for (const [name, loc] of targets) {
      try {
        const r = await pressed(page, loc);
        results.press.push({ vp, name, ...r });
        log(`press ${vp} ${name}: vs rest ${r.changedFromRest ? 'CHANGES' : 'no change'} · vs hover ${r.changedFromHover ? 'CHANGES' : 'no change'} (rest ${r.rest} → press ${r.press})`);
      } catch (e) { log(`press ${vp} ${name}: ERROR ${e.message.slice(0, 120)}`); }
    }
    await ctx.close();
  }
  if (ONLY.includes('lists')) {
    const ctx = await browser.newContext({ ...VIEWPORTS[vp], storageState: state });
    const page = await ctx.newPage();
    for (const path of ['/library/members', '/lending/loans', '/lending', '/customers']) {
      const r = await listShape(page, path);
      results.lists.push({ vp, ...r });
      log(`list  ${vp} ${path}: first view ${JSON.stringify(r.first)} · after scrolling ${JSON.stringify(r.scrolled)}`);
    }
    await ctx.close();
  }
}
await browser.close();

// ── summary ──────────────────────────────────────────────────────────────────
const pct = (xs, p) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
const summary = [];
for (const vp of WIDTHS) for (const pname of PROFILE_NAMES) {
  const rows = results.nav.filter((r) => r.vp === vp && r.profile === pname && !r.error);
  if (!rows.length) continue;
  summary.push({
    vp, profile: pname, n: rows.length,
    firstChange_p50: pct(rows.map((r) => r.firstChange), 50), firstChange_p95: pct(rows.map((r) => r.firstChange), 95),
    content_p50: pct(rows.map((r) => r.content), 50), content_p95: pct(rows.map((r) => r.content), 95),
    inp_max: pct(rows.map((r) => r.interaction), 100), inp_p75: pct(rows.map((r) => r.interaction), 75),
    loadingUiSeen: rows.filter((r) => r.loadingUi != null).length,
    prefetched: rows.filter((r) => r.prefetchedBefore > 0).length,
  });
}
results.summary = summary;
for (const s of summary) log(`summary ${JSON.stringify(s)}`);
writeFileSync(OUT, JSON.stringify(results, (k, v) => (k === 'req' ? undefined : v), 2));
log(`\nwrote ${OUT}`);
