/**
 * phonecountry.mjs — a mobile number from another country, end to end.
 *
 * The owner, 9 Oct 2026: "in all places of mobile input field keep that default
 * of India but also allow to select other countries". Every mobile field is
 * `UbPhoneInput`, so this walks the one most merchants use — adding a customer —
 * on a phone and a laptop, and asserts what unit tests cannot:
 *
 *  - the field opens on India (+91), as before;
 *  - the code is ml-uikit's searchable list: it opens, SEARCHES by name and by
 *    code, picks, and reopens with an empty search;
 *  - picking the UK and typing a UK number SAVES, and the server stores E.164
 *    (the API refused every non-+91 number on several fields before this);
 *  - the code label never overlaps the digits, at either width, for a
 *    two-character code and a four-character one — MEASURED, because an
 *    overlap is pixels and `getByRole` reads straight through it;
 *  - nothing on the phone is wider than the screen.
 *
 *   node e2e/phonecountry.mjs [--shots]   (shots → /tmp/e2e-shots/phonecountry)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { api, newOwner } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = '/tmp/e2e-shots/phonecountry';

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check}${detail && !ok ? `\n        ${detail}` : ''}`);
};

const owner = await newOwner({ shop: 'Phone Country Stores', prefix: 'phonecc' });
/** A UK mobile per viewport: a book refuses the same mobile twice. */
const ukNumber = (i) => `79111234${String(50 + i)}`;

/** Does the code label end before the first digit starts? */
const measure = (page) =>
  page.evaluate(() => {
    const button = document.querySelector('[role="combobox"][aria-label="Country code"]');
    const label = button;
    const input = button?.closest('div.relative')?.querySelector('input');
    if (!label || !input) return null;
    const labelRight = label.getBoundingClientRect().right;
    const inputBox = input.getBoundingClientRect();
    const textStart = inputBox.left + parseFloat(getComputedStyle(input).paddingLeft);
    return {
      code: label.textContent,
      gap: Math.round(textStart - labelRight),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const [index, vp] of [
  { id: 'phone', width: 360, height: 780, isMobile: true },
  { id: 'desktop', width: 1280, height: 800, isMobile: false },
].entries()) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', owner.email);
  await page.fill('input[type="password"]', owner.password);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.goto(`${FRONTEND}/customers`, { waitUntil: 'networkidle', timeout: 120000 });

  await page.getByRole('button', { name: /^Add (customer|party)/ }).filter({ visible: true }).first().click();
  const picker = page.getByRole('combobox', { name: 'Country code' });
  await picker.waitFor({ timeout: 20000 });
  const search = page.getByPlaceholder('Search country or code');
  /** Open the list, search it, and pick the first row (the best match). */
  const pick = async (query, expected) => {
    await picker.click();
    await search.waitFor({ timeout: 10000 });
    const startedEmpty = (await search.inputValue()) === '';
    await search.fill(query);
    const first = page.getByRole('listbox').getByRole('option').first();
    const firstText = (await first.textContent())?.trim();
    await first.click();
    return { startedEmpty, firstText, ok: firstText === expected };
  };

  record(`${vp.id}: the mobile field opens on India`, (await picker.textContent())?.trim() === '+91');
  // Measured once the list has arrived (it loads after first paint and makes
  // the label wider) — the moment the overlap used to appear.
  await page.waitForTimeout(300);
  const india = await measure(page);
  record(
    `${vp.id}: +91 sits clear of the digits`,
    india?.code === '+91' && india.gap >= 6,
    JSON.stringify(india)
  );

  const name = `Overseas ${vp.id} ${Date.now()}`;
  await page.getByLabel('Name', { exact: true }).fill(name);
  const byName = await pick('united kingdom', 'United Kingdom (+44)');
  record(`${vp.id}: searching "united kingdom" finds the UK first`, byName.ok, JSON.stringify(byName));
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id);
  record(`${vp.id}: after the pick, focus is on the number`, focused !== 'Country code', String(focused));
  await page.getByLabel('Mobile number').fill(`0${ukNumber(index)}`);
  const uk = await measure(page);
  record(`${vp.id}: picking the UK shows +44 clear of the digits`, uk?.code === '+44' && uk.gap >= 6, JSON.stringify(uk));
  record(`${vp.id}: the UK trunk 0 is dropped as typed`, (await page.getByLabel('Mobile number').inputValue()) === ukNumber(index));

  // A four-character code is the widest label the picker can show.
  const byCode = await pick('971', 'United Arab Emirates (+971)');
  record(`${vp.id}: searching "971" finds the UAE first`, byCode.ok, JSON.stringify(byCode));
  record(`${vp.id}: the list reopens with an empty search`, byCode.startedEmpty);
  const uae = await measure(page);
  record(`${vp.id}: a four-character code (+971) still clears the digits`, uae?.code === '+971' && uae.gap >= 6, JSON.stringify(uae));
  record(`${vp.id}: the page is no wider than the screen`, (uae?.pageOverflow ?? 1) <= 0, JSON.stringify(uae));
  if (SHOTS) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${vp.id}-uae.png` });
  }
  await picker.click();
  await search.fill('kingdom');
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${vp.id}-open.png` });
  await page.getByRole('listbox').getByRole('option').first().click();
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${vp.id}-uk.png` });

  await page.getByRole('button', { name: /^Save/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(2500);
  const found = await api('GET', `/parties?q=${encodeURIComponent(name)}`, null, owner.token);
  const stored = found.body?.data?.[0]?.mobile;
  record(`${vp.id}: the customer saves with the UK number in E.164`, stored === `+44${ukNumber(index)}`, JSON.stringify(stored));
  record(`${vp.id}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
