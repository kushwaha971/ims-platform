/**
 * e2e/demo/lib.mjs — what every demo recorder shares: where the demo stack is,
 * how to sign in the way a merchant does (mobile number, then the code from
 * the DEMO API's log — the console OTP provider), and how to pick a business.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FE = process.env.DEMO_FRONTEND ?? 'http://localhost:3100';
export const LOG = process.env.DEMO_API_LOG;
export const STATE = JSON.parse(readFileSync(process.env.DEMO_STATE ?? path.join(HERE, '.demo-state.json'), 'utf8'));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const logSize = () => readFileSync(LOG, 'utf8').length;

export const codeFor = async (mobile, from) => {
  for (let i = 0; i < 40; i += 1) {
    const log = readFileSync(LOG, 'utf8').slice(from);
    const hits = [...log.matchAll(/sms\.console to=\+91…(\d{3}) body=(\d{4,6}) is your/g)].filter((m) => m[1] === mobile.slice(-3));
    if (hits.length) return hits.at(-1)[2];
    await sleep(300);
  }
  throw new Error('no OTP in the demo API log');
};

/** Sign in through the real screen. `pace` slows typing for a film. */
export const signIn = async (page, { mobile = STATE.owner.mobile, pace = 0, path: at = '/login' } = {}) => {
  await page.goto(`${FE}${at}`, { waitUntil: 'networkidle' });
  const field = page.getByLabel(/Mobile number|मोबाइल नंबर/).first();
  await field.click();
  await field.pressSequentially(mobile, { delay: pace });
  const from = logSize();
  await sleep(pace ? 500 : 0);
  await page.getByRole('button', { name: /Send code|कोड भेजें/ }).click();
  await page.getByRole('heading', { name: /Enter the code|कोड डालें|कोड/ }).waitFor({ timeout: 30000 });
  const code = await codeFor(mobile, from);
  await sleep(pace ? 1200 : 0);
  await page.getByRole('textbox').first().focus();
  await page.keyboard.type(code, { delay: pace ? 260 : 0 });
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => {});
};

/** Pick a business on the product's own /switch screen, by its name. */
export const useBusiness = async (page, name) => {
  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' });
  await page.getByRole('main').getByText(name, { exact: false }).first().click();
  // The business already in use does not navigate; any other one does.
  await page.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
};

/**
 * A visible pointer. Headless recordings carry no cursor, so a film of somebody
 * clicking looks like a screen changing by itself; this draws a dot that
 * follows the real mouse and pulses on a click. Recording contexts only.
 */
export const CURSOR_SCRIPT = `
(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const make = () => {
    const dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(245,158,11,.55);border:2px solid rgba(180,83,9,.9);box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;z-index:2147483647;transition:transform .12s ease;transform:translate(-100px,-100px)';
    document.documentElement.appendChild(dot);
    let x = -100, y = -100;
    const place = (s = 1) => { dot.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')'; };
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; place(); }, true);
    addEventListener('mousedown', () => place(0.65), true);
    addEventListener('mouseup', () => place(1), true);
  };
  if (document.documentElement) make(); else addEventListener('DOMContentLoaded', make);
})();`;

/** Move the pointer to a control the way a hand does, then click it. */
export const clickEl = async (page, locator, { steps = 22, after = 500 } = {}) => {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await sleep(180);
  await locator.click();
  await sleep(after);
};

export const typeSlow = async (page, text, delay = 85) => page.keyboard.type(text, { delay });

/**
 * A poster in both formats from one PNG frame. `sharp` (already the frontend's
 * image library) rather than ffmpeg: Homebrew's ffmpeg is built without a WebP
 * encoder, and the posters must be WebP first.
 */
export const writePosters = async (png, base, { webp = 72, jpg = 78 } = {}) => {
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(HERE, '..', '..', 'frontend', 'package.json'));
  const sharp = require('sharp');
  await sharp(png).webp({ quality: webp }).toFile(`${base}.webp`);
  await sharp(png).jpeg({ quality: jpg, mozjpeg: true }).toFile(`${base}.jpg`);
};
