/**
 * look-landing.mjs — the "look" step for the landing page, fast.
 *
 * `landing.mjs` is the gate: every width, both themes, the network, the
 * keyboard. This is what a designer runs between edits: a handful of section
 * screenshots at the widths that matter, in a few seconds, so the page is
 * LOOKED at after every change rather than once at the end.
 *
 *   node e2e/look-landing.mjs [390,1440] [light,dark]
 *
 * Writes $E2E_SHOTS/landing/look-<section>-<width>-<theme>.png.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const FRONTEND = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const SHOT_DIR = `${process.env.E2E_SHOTS ?? "/tmp/e2e-shots"}/landing`;
mkdirSync(SHOT_DIR, { recursive: true });

const widths = (process.argv[2] ?? "390,1440").split(",").map(Number);
const themes = (process.argv[3] ?? "light,dark").split(",");
const SECTIONS = ["platform", "modules", "features", "faq"];

const browser = await chromium.launch();
for (const width of widths) {
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 } });
    if (theme === "dark") await ctx.addCookies([{ name: "ub_theme_choice", value: "dark", url: FRONTEND }]);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${SHOT_DIR}/look-hero-${width}-${theme}.png` });
    // Reveal everything once, then hide the floating header so a tall
    // section's screenshot is not photographed through it.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 500) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(60);
    }
    await page.addStyleTag({ content: "header { visibility: hidden !important; }" });
    for (const id of SECTIONS) {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await section.screenshot({ path: `${SHOT_DIR}/look-${id}-${width}-${theme}.png` });
    }
    const audience = page.locator('section[aria-labelledby="landing-audience-title"]');
    await audience.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await audience.screenshot({ path: `${SHOT_DIR}/look-audience-${width}-${theme}.png` });
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    console.log(`${width} ${theme}: scrollWidth ${sw} / ${iw}`);
    await ctx.close();
  }
}
await browser.close();
