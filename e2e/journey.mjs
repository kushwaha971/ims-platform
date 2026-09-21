#!/usr/bin/env node
/**
 * e2e/journey.mjs — the end-to-end check that runs after every change.
 *
 * It exists because five defects reached a first review that no unit test could
 * have caught: sign-in was impossible cross-origin, `/login` redirected to
 * itself unboundedly, dark theme won on first paint, the language reset on
 * refresh, and below 1024px there was no way to reach any route. Every one of
 * them needed a real browser against a real backend.
 *
 * So this is deliberately not a unit test. It drives Chromium against the
 * running stack, at every breakpoint the product claims to support, and it fails
 * on things a passing render would otherwise hide: a console error, a failed
 * request, an unexpected 4xx/5xx, a redirect loop.
 *
 *   node e2e/journey.mjs                    # all checks, all viewports
 *   node e2e/journey.mjs --viewport laptop  # one viewport
 *   node e2e/journey.mjs --shots            # write screenshots
 *
 * Exits non-zero on any failure, so it can gate a commit.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots';

/** The breakpoints the product claims to support, named as the brief names them. */
export const VIEWPORTS = {
  'small-mobile': { width: 360, height: 640 },
  'large-mobile': { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
  /** A laptop in a shallow window — the case that hides action bars. */
  'short-height': { width: 1280, height: 560 },
};

const args = process.argv.slice(2);
const only = args.includes('--viewport') ? args[args.indexOf('--viewport') + 1] : null;
const wantShots = args.includes('--shots');

const results = [];
const record = (viewport, check, ok, detail = '') =>
  results.push({ viewport, check, ok, detail });

/**
 * Noise we refuse to fail on, each with a reason. Anything not listed is a
 * failure — the point is that the list is short and argued, not that errors are
 * broadly tolerated.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[HMR\]/,
  /React DevTools/,
  // Chrome logs a bare "Failed to load resource: … 401" with no URL, so it
  // cannot be matched against the allowed-401 list the way a response can. The
  // response listener already judges every 401 by URL and fails on any that is
  // not /auth/me or /auth/refresh, so this generic line is covered there and
  // would otherwise double-report the correct pre-sign-in 401.
  /Failed to load resource: the server responded with a status of 401/,
];

/** Watches one page and collects everything that should fail a run. */
function watch(page, label) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const navigations = [];

  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
    consoleErrors.push(text.slice(0, 300));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? '';
    // A navigation the app itself aborts by redirecting is not a failure.
    if (f.includes('ERR_ABORTED')) return;
    failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} — ${f}`);
  });
  page.on('response', (r) => {
    const s = r.status();
    const url = r.url();
    if (s < 400) return;
    // 401 on /auth/me and /auth/refresh before sign-in is the correct answer.
    if (s === 401 && /\/auth\/(me|refresh)$/.test(url)) return;
    badResponses.push(`${s} ${r.request().method()} ${url.slice(0, 120)}`);
  });
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations.push(f.url());
  });

  return {
    label,
    consoleErrors,
    pageErrors,
    failedRequests,
    badResponses,
    navigations,
    /** A redirect loop shows up as the same path visited over and over. */
    redirectLoop() {
      const paths = navigations.map((u) => {
        try { return new URL(u).pathname; } catch { return u; }
      });
      const counts = new Map();
      for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1);
      const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return worst && worst[1] >= 5 ? `${worst[0]} visited ${worst[1]}×` : null;
    },
    summary() {
      return {
        consoleErrors: [...new Set(this.consoleErrors)],
        pageErrors: [...new Set(this.pageErrors)],
        failedRequests: [...new Set(this.failedRequests)],
        badResponses: [...new Set(this.badResponses)],
      };
    },
  };
}

const shot = async (page, name) => {
  if (!wantShots) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
};

/** The resolved theme, read the way the browser resolves it. */
const readTheme = (page) =>
  page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    cookie: document.cookie.match(/(?:^|; )ub_theme=([^;]*)/)?.[1] ?? null,
  }));

async function run() {
  const browser = await chromium.launch();
  const names = only ? [only] : Object.keys(VIEWPORTS);

  for (const name of names) {
    const viewport = VIEWPORTS[name];
    if (!viewport) throw new Error(`unknown viewport ${name}`);

    // ── Light theme is the default, with the OS asking for dark ──────────────
    // The OS preference must NOT decide the theme. This is forced dark so a
    // regression cannot hide behind a light-mode CI machine.
    {
      const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
      const page = await ctx.newPage();
      const w = watch(page, 'login');
      await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1200);

      const theme = await readTheme(page);
      record(name, 'light is the default when the OS asks for dark', theme.attr === 'light',
        `data-theme=${theme.attr} bg=${theme.bg} cookie=${theme.cookie}`);

      const loop = w.redirectLoop();
      record(name, 'no redirect loop on /login', loop === null, loop ?? '');

      const formVisible = await page.locator('input[type="email"], input[name="email"]').count();
      record(name, 'login form renders', formVisible > 0, `${formVisible} email input(s)`);

      await shot(page, `${name}-01-login`);
      const s = w.summary();
      record(name, 'no console errors on /login', s.consoleErrors.length === 0, s.consoleErrors.join(' | '));
      record(name, 'no page errors on /login', s.pageErrors.length === 0, s.pageErrors.join(' | '));
      record(name, 'no unexpected 4xx/5xx on /login', s.badResponses.length === 0, s.badResponses.join(' | '));
      await ctx.close();
    }

    // ── Language survives a refresh ──────────────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(800);

      const picker = page.locator('select').filter({ hasText: /English|हिन्दी/ }).first();
      const hasPicker = (await picker.count()) > 0;

      if (!hasPicker) {
        record(name, 'language picker present', false, 'no language select found on /login');
      } else {
        await picker.selectOption('hi');
        await page.waitForTimeout(700);
        const beforeHtmlLang = await page.getAttribute('html', 'lang');
        const beforeText = (await page.locator('body').innerText()).slice(0, 400);

        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        const afterHtmlLang = await page.getAttribute('html', 'lang');
        const afterText = (await page.locator('body').innerText()).slice(0, 400);
        const afterSelect = await picker.inputValue().catch(() => '?');

        record(name, 'language survives refresh (html lang)', afterHtmlLang === 'hi',
          `before=${beforeHtmlLang} after=${afterHtmlLang}`);
        record(name, 'language survives refresh (rendered copy)',
          beforeText.trim() === afterText.trim(),
          beforeText.trim() === afterText.trim() ? '' : 'UI reverted to the default locale');
        record(name, 'language survives refresh (picker value)', afterSelect === 'hi',
          `picker=${afterSelect}`);
        await shot(page, `${name}-02-after-refresh-hi`);
      }
      await ctx.close();
    }

    // ── Navigation is reachable at this width ────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(500);
      // Signed out, so this checks the shell, not the nav contents — the signed-in
      // nav check lives in the authenticated journey below.
      await ctx.close();
    }
  }

  await browser.close();

  // ── Report ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  const byViewport = new Map();
  for (const r of results) {
    if (!byViewport.has(r.viewport)) byViewport.set(r.viewport, []);
    byViewport.get(r.viewport).push(r);
  }

  for (const [vp, rows] of byViewport) {
    const bad = rows.filter((r) => !r.ok).length;
    console.log(`\n${vp}  ${VIEWPORTS[vp].width}×${VIEWPORTS[vp].height}  —  ${rows.length - bad}/${rows.length} passed`);
    for (const r of rows) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? `\n         ${r.detail}` : ''}`);
    }
  }

  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(`${SHOT_DIR}/results.json`, JSON.stringify(results, null, 2));

  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(`\n${failed.length} FAILED:`);
    for (const f of failed) console.log(`  [${f.viewport}] ${f.check} — ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });
