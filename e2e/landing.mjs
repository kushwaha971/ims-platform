/**
 * landing.mjs — the public landing page at `/`, end to end, against the LIVE
 * stack (`./e2e/serve-api.sh && ./e2e/serve.sh`).
 *
 * Why a harness and not only unit tests: every promise the page makes is about
 * a browser — what is DOWNLOADED (one hero variant, not both), what is MEASURED
 * (no horizontal scroll from 360 px to 4K, the tilted frame included), what
 * MOVES (the hero loop plays; under reduced motion nothing runs at all) and
 * what PERSISTS (the theme toggle survives a reload). jsdom has no layout, no
 * network and no media pipeline, so none of that is visible to `npm test`.
 *
 * Checks:
 *   - at 360, 390, 768, 1024, 1280, 1440, 1920, 2560 and 3840, light and dark:
 *     the page's scrollWidth never exceeds the viewport; the h1 is visible
 *     within 1 s; only ONE hero variant (desktop or phone) is requested; the
 *     hero loop's currentTime advances. A screenshot of the first view.
 *   - the theme toggle's choice survives a reload;
 *   - signed-out `/` is the landing page, signed-in `/` is the dashboard;
 *   - the keyboard reaches both hero CTAs and the use-case tabs, and the arrow
 *     keys switch tabs;
 *   - the phone menu is a dialog: focus trapped, Escape closes, focus returns;
 *   - "Watch the demo" opens a dialog with the film and captions; Escape closes;
 *   - reduced motion: no running animation, the rotator frozen, the hero loop
 *     not playing;
 *   - Hindi renders the Hindi hero.
 *
 * `--perf` additionally measures LCP, CLS, JS transferred and media bytes on
 * the first view at 390 and 1440, unthrottled and on a throttled profile.
 *
 * Screenshots go to $E2E_SHOTS/landing (default /tmp/e2e-shots/landing).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

import { newOwner, PASSWORD } from "./lib/fixtures.mjs";

const FRONTEND = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const SHOT_DIR = `${process.env.E2E_SHOTS ?? "/tmp/e2e-shots"}/landing`;
mkdirSync(SHOT_DIR, { recursive: true });
const PERF = process.argv.includes("--perf");

const results = [];
const record = (check, ok, detail = "") => {
  results.push({ check, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${check}${detail ? `\n        ${detail}` : ""}`);
};

const WIDTHS = [
  [360, 780],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

const browser = await chromium.launch();

async function contextFor({ width, height, theme = "light", reducedMotion = "no-preference", locale } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion,
    deviceScaleFactor: 1,
  });
  const cookies = [];
  if (theme === "dark") cookies.push({ name: "ub_theme_choice", value: "dark", url: FRONTEND });
  if (locale) cookies.push({ name: "ub_locale", value: locale, url: FRONTEND });
  if (cookies.length) await ctx.addCookies(cookies);
  return ctx;
}

/** Scroll top to bottom so every reveal and lazy video has had its chance. */
async function sweep(page, height) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.6)) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(90);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

/** The hero video element that is actually displayed at this width. */
const heroVideoState = (page) =>
  page.evaluate(() => {
    const hero = document.querySelector('section[aria-labelledby="landing-hero-title"]');
    const videos = [...(hero?.querySelectorAll("video") ?? [])];
    const shown = videos.find((v) => v.getClientRects().length > 0);
    return shown
      ? { found: true, time: shown.currentTime, paused: shown.paused, src: shown.currentSrc }
      : { found: false };
  });

// ── 1. every width, both themes ─────────────────────────────────────────────
for (const [width, height] of WIDTHS) {
  for (const theme of ["light", "dark"]) {
    const tag = `${width}×${height} ${theme}`;
    const ctx = await contextFor({ width, height, theme });
    const page = await ctx.newPage();
    const media = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/media/landing/")) media.push(url.pathname);
    });

    const started = Date.now();
    await page.goto(`${FRONTEND}/`, { waitUntil: "commit" });
    let h1Ms = null;
    try {
      await page.locator("h1").waitFor({ state: "visible", timeout: 5000 });
      h1Ms = Date.now() - started;
    } catch {
      h1Ms = null;
    }
    record(`${tag}: hero h1 visible within 1 s`, h1Ms !== null && h1Ms <= 1000, `${h1Ms} ms`);

    await page.waitForLoadState("networkidle").catch(() => undefined);
    const theme0 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    record(`${tag}: renders in the ${theme} theme`, theme0 === theme, `data-theme=${theme0}`);

    // The hero loop: it should be playing, and moving.
    const before = await heroVideoState(page);
    await page.waitForTimeout(2200);
    const after = await heroVideoState(page);
    record(
      `${tag}: the hero loop plays (currentTime advances)`,
      after.found && after.time > (before.time ?? 0) + 0.5 && !after.paused,
      `${before.time?.toFixed?.(2)} → ${after.time?.toFixed?.(2)} ${after.src ?? ""}`,
    );

    await page.screenshot({ path: `${SHOT_DIR}/view-${width}-${theme}.png` });

    const desktop = media.filter((p) => p.includes("hero-desktop"));
    const mobile = media.filter((p) => p.includes("hero-mobile"));
    const expectDesktop = width >= 1024;
    record(
      `${tag}: requests only the ${expectDesktop ? "desktop" : "phone"} hero variant`,
      expectDesktop ? desktop.length > 0 && mobile.length === 0 : mobile.length > 0 && desktop.length === 0,
      `desktop ${desktop.length}, phone ${mobile.length}`,
    );

    await sweep(page, height);
    const [scrollWidth, innerWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    record(`${tag}: no horizontal overflow`, scrollWidth <= innerWidth, `${scrollWidth} vs ${innerWidth}`);

    if ([390, 1440, 3840].includes(width)) {
      await page.screenshot({ path: `${SHOT_DIR}/full-${width}-${theme}.png`, fullPage: true });
    }
    await ctx.close();
  }
}

// ── 2. the theme toggle persists ────────────────────────────────────────────
{
  const ctx = await contextFor({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  const toggle = page.getByTestId("landing-theme-toggle").first();
  await toggle.click();
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: "networkidle" });
  const state = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute("data-theme"),
    cookie: document.cookie,
  }));
  const pressed = await page.getByTestId("landing-theme-toggle").first().getAttribute("aria-pressed");
  record(
    "the theme toggle's choice survives a reload",
    state.theme === "dark" && pressed === "true" && state.cookie.includes("ub_theme_choice=dark"),
    `${state.theme}, aria-pressed=${pressed}`,
  );
  await ctx.close();
}

// ── 3. signed-out / is the landing page, signed-in / is the dashboard ───────
{
  const ctx = await contextFor({ width: 1280, height: 800 });
  const page = await ctx.newPage();
  const response = await page.goto(`${FRONTEND}/`, { waitUntil: "domcontentloaded" });
  const h1 = await page.locator("h1").innerText();
  record(
    "signed-out / shows the landing page",
    response?.status() === 200 && new URL(page.url()).pathname === "/" && /One khata/.test(h1),
    `${response?.status()} ${page.url()}`,
  );

  let owner = null;
  try {
    owner = await newOwner({ shop: "Landing Check Store", prefix: "e2e-landing" });
  } catch (error) {
    console.log(`        (could not create an owner: ${error.message})`);
  }
  if (owner) {
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', owner.email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
    await page.goto(`${FRONTEND}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 15000 }).catch(() => undefined);
    record("signed-in / goes to the dashboard", new URL(page.url()).pathname === "/dashboard", page.url());
  } else {
    record("signed-in / goes to the dashboard", false, "no owner could be registered (429?)");
  }
  await ctx.close();
}

// ── 4. keyboard: CTAs, then the tabs, and arrows switch them ─────────────────
{
  const ctx = await contextFor({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  const seen = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        testid: el?.getAttribute("data-testid") ?? "",
        role: el?.getAttribute("role") ?? el?.tagName.toLowerCase(),
        text: (el?.textContent ?? "").trim().slice(0, 30),
      };
    });
    seen.push(focused);
    if (focused.role === "tab") break;
  }
  const order = seen.map((f) => f.testid || `${f.role}:${f.text}`);
  const heroStart = order.indexOf("landing-hero-start");
  const demo = order.indexOf("landing-demo-open");
  const tab = seen.findIndex((f) => f.role === "tab");
  record(
    "Tab reaches Start free, then Watch the demo, then the use-case tabs",
    heroStart >= 0 && demo > heroStart && tab > demo,
    order.join(" → "),
  );
  await page.keyboard.press("ArrowRight");
  const afterArrow = await page.evaluate(() => ({
    focused: document.activeElement?.textContent?.trim(),
    selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim(),
  }));
  record(
    "ArrowRight moves the selected, focused tab",
    afterArrow.focused === "Reminders" && afterArrow.selected === "Reminders",
    JSON.stringify(afterArrow),
  );
  await page.locator("#features").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT_DIR}/explorer-1440-reminders.png` });
  await ctx.close();
}

// ── 5. the phone menu and the demo dialog ────────────────────────────────────
{
  const ctx = await contextFor({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await dialog.waitFor({ state: "visible" });
  await page.screenshot({ path: `${SHOT_DIR}/menu-390.png` });
  let trapped = true;
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    trapped = trapped && inside;
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const returned = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-haspopup") === "dialog",
  );
  record("the phone menu traps focus, closes on Escape and returns focus", trapped && returned, `trapped=${trapped} returned=${returned}`);

  await page.getByTestId("landing-demo-open").click();
  const demo = page.getByRole("dialog", { name: "YourKhata demo" });
  await demo.waitFor({ state: "visible", timeout: 10000 });
  const film = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="landing-demo-video"]');
    const unavailable = !!document.querySelector('[data-testid="landing-demo-unavailable"]');
    return { src: v?.getAttribute("src"), track: !!v?.querySelector('track[kind="captions"]'), unavailable };
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT_DIR}/demo-390.png` });
  await page.keyboard.press("Escape");
  await demo.waitFor({ state: "hidden" });
  record(
    "Watch the demo opens the film with captions (or says it is unavailable), and Escape closes it",
    (film.src?.endsWith("demo-mobile.mp4") && film.track) || film.unavailable,
    JSON.stringify(film),
  );
  await ctx.close();
}

// ── 6. reduced motion ────────────────────────────────────────────────────────
{
  const ctx = await contextFor({ width: 1440, height: 900, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  const word0 = await page.locator('[data-testid="ub-rotator"] [data-state="in"]').innerText();
  await page.waitForTimeout(3000);
  const word1 = await page.locator('[data-testid="ub-rotator"] [data-state="in"]').innerText();
  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running")
        .map((a) => a.animationName ?? a.transitionProperty ?? a.constructor.name),
  );
  const video = await heroVideoState(page);
  record("reduced motion: no running animations", running.length === 0, running.join(", "));
  record("reduced motion: the rotating word is frozen", word0 === word1, `${word0} / ${word1}`);
  record(
    "reduced motion: the hero loop does not autoplay",
    video.found && (video.paused || video.time === 0),
    JSON.stringify(video),
  );
  await page.screenshot({ path: `${SHOT_DIR}/reduced-motion-1440.png` });
  await ctx.close();
}

// ── 7. Hindi ────────────────────────────────────────────────────────────────
{
  const ctx = await contextFor({ width: 390, height: 844, locale: "hi" });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const h1 = await page.locator("h1").innerText();
  record("Hindi renders the Hindi hero, brand in Latin", /पूरी दुकान का एक खाता/.test(h1), h1.replace(/\n/g, " / "));
  await page.screenshot({ path: `${SHOT_DIR}/view-390-hi.png` });
  await sweep(page, 844);
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  record("Hindi: no horizontal overflow at 390", sw <= iw, `${sw} vs ${iw}`);
  await ctx.close();
}

// ── 8. performance (optional) ────────────────────────────────────────────────
if (PERF) {
  const profiles = [
    { name: "unthrottled", network: null, cpu: 1 },
    { name: "throttled (1.6 Mbps / 150 ms RTT, 4× CPU)", network: { latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 }, cpu: 4 },
  ];
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    for (const profile of profiles) {
      const ctx = await contextFor({ width, height });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      if (profile.network) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.network });
      if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
      const urls = new Map();
      const bytes = new Map();
      cdp.on("Network.requestWillBeSent", (e) => urls.set(e.requestId, { url: e.request.url, type: e.type }));
      cdp.on("Network.responseReceived", (e) => {
        const entry = urls.get(e.requestId);
        if (entry) entry.type = e.type;
      });
      cdp.on("Network.loadingFinished", (e) => bytes.set(e.requestId, e.encodedDataLength));
      cdp.on("Network.dataReceived", (e) => {
        // A playing video's range response may not have finished by the
        // time we read; count what has arrived.
        bytes.set(e.requestId, (bytes.get(e.requestId) ?? 0) + e.encodedDataLength);
      });
      await page.addInitScript(() => {
        window.__lcp = 0;
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${FRONTEND}/`, { waitUntil: "load" });
      await page.waitForTimeout(profile.network ? 8000 : 4000);
      const { lcp, cls, lcpEl } = await page.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, lcpEl: "" }));
      let js = 0;
      let mediaBytes = 0;
      const mediaFiles = new Set();
      for (const [id, entry] of urls) {
        const size = bytes.get(id) ?? 0;
        const path = new URL(entry.url).pathname;
        if (entry.type === "Script" || path.endsWith(".js")) js += size;
        if (path.startsWith("/media/")) {
          mediaBytes += size;
          mediaFiles.add(path.split("/").pop());
        }
      }
      console.log(
        `perf  ${width}px ${profile.name}: LCP ${Math.round(lcp)} ms · CLS ${cls.toFixed(4)} · JS ${(js / 1024).toFixed(1)} KB transferred · media ${(mediaBytes / 1024).toFixed(0)} KB [${[...mediaFiles].join(", ")}]${lcpEl}`,
      );
      await ctx.close();
    }
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} landing checks passed`);
if (failed.length) {
  failed.forEach((r) => console.log(`  FAIL ${r.check}`));
  process.exit(1);
}
