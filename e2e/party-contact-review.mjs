#!/usr/bin/env node
/**
 * WP-07 look — "Choose from phone contacts" on the party form (PTY-07 FR-10).
 *
 * No real address book is read, ever. Desktop Chromium has no Contact Picker,
 * so the first pass checks the button is ABSENT there (FR-14). The second pass
 * stands in a fake `navigator.contacts` with one made-up contact, the way a
 * phone's picker would answer, and checks that choosing it fills Name and
 * Mobile and saves nothing until Save. Customers, Suppliers and the Udhaar
 * book's add form at four widths, measured for page width and cut text.
 * Output in /tmp/e2e-shots/party-contact.
 *
 *   node e2e/party-contact-review.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { newOwner, must } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/party-contact';
mkdirSync(ROOT, { recursive: true });
const WIDTHS = [
  ['360', { width: 360, height: 780 }],
  ['768', { width: 768, height: 1024 }],
  ['1280', { width: 1280, height: 800 }],
  ['1920', { width: 1920, height: 1080 }],
];
const SCREENS = [
  ['customers', '/customers', /add customer/i],
  ['suppliers', '/suppliers', /add supplier/i],
  ['khata', '/khata', /add (customer|party)/i],
];
// A made-up contact, answered the way Android Chrome's picker answers.
const FAKE_PICKER = () => {
  Object.defineProperty(navigator, 'contacts', {
    configurable: true,
    value: { select: async () => [{ name: ['  Asha   Devi '], tel: ['098765 43210'] }] },
  });
};

const owner = await newOwner({ shop: 'Shree Ganesh Kirana Stores', name: 'Contact Owner', prefix: 'contact' });
const before = (await must('GET', '/parties?page_size=50', null, owner.token)).length ?? null;

const measure = (page) => page.evaluate(() => {
  const clipped = [];
  for (const el of document.querySelectorAll('[role="dialog"] *')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only')) continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 60));
  }
  return { overflow: document.documentElement.scrollWidth - window.innerWidth, clipped };
});

const failures = [];
const check = (size, name, ok, detail = '') => {
  if (!ok) failures.push(`${size}: ${name} ${detail}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${size} ${name} ${detail}`);
};
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of WIDTHS) {
  for (const withPicker of [false, true]) {
    const ctx = await browser.newContext({ viewport, locale: 'en-IN', serviceWorkers: 'block' });
    if (withPicker) await ctx.addInitScript(FAKE_PICKER);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.fill('input[type="email"]', owner.email);
    await page.fill('input[type="password"]', owner.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
    for (const [name, path, add] of SCREENS) {
      await page.goto(`${FE}${path}`, { waitUntil: 'networkidle' });
      const addButton = page.getByRole('button', { name: add }).first();
      if (!(await addButton.isVisible().catch(() => false))) {
        console.log(`skip ${size} ${name}: no add button on ${page.url()}`);
        continue;
      }
      await addButton.click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: /^name/i }).waitFor();
      const choose = dialog.getByRole('button', { name: 'Choose from phone contacts' });
      const tag = `${size}-${name}-${withPicker ? 'phone' : 'desktop'}`;
      if (!withPicker) {
        check(size, `${name}: no contact button where the browser has no picker`, (await choose.count()) === 0);
      } else {
        check(size, `${name}: contact button shown on a phone`, await choose.isVisible());
        await page.screenshot({ path: `${ROOT}/${tag}-1-open.png` });
        await choose.click();
        const nameValue = await dialog.getByRole('textbox', { name: /^name/i }).inputValue();
        check(size, `${name}: chosen contact fills the name, tidied`, nameValue === 'Asha Devi', nameValue);
        const mobile = await dialog.getByRole('textbox', { name: /mobile/i }).inputValue();
        check(size, `${name}: and the mobile`, mobile.replace(/\D/g, '') === '9876543210', mobile);
        await page.screenshot({ path: `${ROOT}/${tag}-2-filled.png` });
      }
      const m = await measure(page);
      check(size, `${name}: page fits`, m.overflow <= 0, String(m.overflow));
      check(size, `${name}: no cut text in the form`, m.clipped.length === 0, m.clipped.join(' | '));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    check(size, 'no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
await browser.close();
const after = (await must('GET', '/parties?page_size=50', null, owner.token)).length ?? null;
check('all', 'choosing a contact saved nobody', before === after, `${before} → ${after}`);
console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
