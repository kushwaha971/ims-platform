#!/usr/bin/env node
/**
 * WP-04 MSG-02..05 — the share sheet is an editable composer. On a live stack,
 * at 360 and 1280 px, it opens the Udhaar khata of a person who owes ₹500,
 * opens "Send reminder", and checks what reaches WhatsApp and SMS:
 *   * the box holds the server's default and the WhatsApp link carries it;
 *   * typed Hindi + emoji + "&" + a line break reach both links unchanged;
 *   * a blank message removes the links and says why;
 *   * "Use the original message" puts the default back;
 *   * "Remind all" (MSG-07/10): the step's box holds that customer's words, an
 *     edit rebuilds the WhatsApp link from it, a blank one offers no link, and
 *     the tap sends the edited words to `/send` so the log keeps what went;
 *   * no page overflow, no page errors.
 * Nothing is sent: the links are read, never followed (the one tap in the
 * Remind all check has its navigation cancelled in the page). Screenshots go to
 * /tmp/e2e-shots/share-composer.
 *
 *   node e2e/share-composer-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { must, newUser, uniq } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/share-composer';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const EDITED = 'नमस्ते Ramesh 🙏\nPlease pay ₹500 by Friday & thank you';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['phone', { width: 360, height: 780 }], ['desktop', { width: 1280, height: 860 }]]) {
  const user = await newUser({ name: 'Composer QA Owner' });
  const ten = await must('POST', '/tenants', { name: `Composer Shop ${uniq()}`, business_type: 'retail', state_code: '27', apps: ['shop', 'khata'] }, user.token);
  user.token = ten.access_token ?? user.token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
  const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, mobile: '9876500011' }, user.token);
  await must('POST', '/ledger-entries', { party_id: ramesh.id, direction: 'debit', amount: '500.00', entry_date: new Date().toISOString().slice(0, 10), note: 'Cement bags' }, user.token);

  const ctx = await browser.newContext({ viewport, locale: 'en-IN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const look = async (name) => {
    await page.waitForTimeout(600);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${size} ${name}: fits the screen`, over <= 0, `${over}px`);
    await page.screenshot({ path: `${ROOT}/${size}-${name}.png`, fullPage: true });
  };

  await page.goto(`${FE}/login/email`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

  // The person page reads the book of the app that is open (DEC-019): open the
  // Udhaar book first, so this is the udhaar khata and its reminder.
  await page.goto(`${FE}/khata`, { waitUntil: 'networkidle' });
  await page.goto(`${FE}/parties/${ramesh.id}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ROOT}/${size}-khata.png`, fullPage: true });
  const direct = page.getByRole('button', { name: /^Send reminder$/ }).filter({ visible: true });
  if (await direct.count()) await direct.first().click();
  else {
    await page.getByRole('button', { name: /more actions/i }).filter({ visible: true }).first().click();
    await page.getByRole('menuitem', { name: /Send reminder/ }).or(page.getByRole('button', { name: /Send reminder/ })).filter({ visible: true }).first().click();
  }
  const dialog = page.getByRole('dialog', { name: 'Send reminder' });
  const box = dialog.getByRole('textbox', { name: 'Message' });
  await box.waitFor({ timeout: 20000 });
  const original = await box.inputValue();
  const waText = async () => {
    const href = await dialog.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
    return new URL(href).searchParams.get('text');
  };
  check(`${size}: the box opens with the server's default`, original.includes('500'), JSON.stringify(original.slice(0, 80)));
  check(`${size}: WhatsApp carries the default`, (await waText()) === original);
  await look('default');

  await box.fill(EDITED);
  check(`${size}: WhatsApp carries the edited text exactly`, (await waText()) === EDITED, JSON.stringify(await waText()));
  const sms = await dialog.getByRole('link', { name: 'SMS' }).getAttribute('href');
  check(`${size}: SMS carries the edited text exactly`, decodeURIComponent(sms.split('&body=')[1] ?? '') === EDITED);
  check(`${size}: SMS goes to the party`, sms.startsWith('sms:+919876500011'), sms.slice(0, 30));
  await look('edited');

  await box.fill('   ');
  check(`${size}: a blank message has no WhatsApp link`, (await dialog.getByRole('link', { name: 'WhatsApp' }).count()) === 0);
  check(`${size}: and says why`, await dialog.getByRole('alert').filter({ hasText: 'Write a message before sending.' }).isVisible());
  await look('blank');

  await dialog.getByRole('button', { name: 'Use the original message' }).click();
  check(`${size}: the default comes back`, (await box.inputValue()) === original && (await waText()) === original);
  await page.keyboard.press('Escape');

  // MSG-07/10 — "Remind all", with the merchant's own words for each customer.
  await must('PATCH', `/parties/${ramesh.id}`, { collection_date: new Date().toISOString().slice(0, 10) }, user.token);
  const posted = [];
  page.on('request', (r) => {
    if (/\/reminders\/[^/]+\/send\/?$/.test(new URL(r.url()).pathname)) posted.push(r.postData() ?? '');
  });
  await page.goto(`${FE}/ledger/reminders`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Remind all on this page' }).filter({ visible: true }).first().click();
  const bulk = page.getByRole('dialog', { name: 'Remind customers' });
  const bulkBox = bulk.getByRole('textbox', { name: 'Message' });
  await bulkBox.waitFor({ timeout: 20000 });
  const bulkLink = bulk.getByRole('link', { name: 'WhatsApp Ramesh Traders' });
  const bulkDefault = await bulkBox.inputValue();
  check(`${size}: Remind all opens with this customer's words`, bulkDefault.includes('500'), JSON.stringify(bulkDefault.slice(0, 60)));
  await look('bulk-default');
  await bulkBox.fill(EDITED);
  const bulkHref = (await bulkLink.getAttribute('href')) ?? '';
  check(`${size}: Remind all's link carries the edit`, new URL(bulkHref).searchParams.get('text') === EDITED);
  check(`${size}: and goes to the customer`, bulkHref.startsWith('https://wa.me/919876500011'), bulkHref.slice(0, 30));
  await look('bulk-edited');
  await bulkBox.fill('  ');
  check(`${size}: a blank Remind all message has no link`, (await bulkLink.count()) === 0);
  check(`${size}: and says why`, await bulk.getByRole('alert').filter({ hasText: 'Write a message before sending.' }).isVisible());
  await look('bulk-blank');
  await bulk.getByRole('button', { name: 'Use the original message' }).click();
  check(`${size}: the customer's words come back`, (await bulkBox.inputValue()) === bulkDefault);
  await bulkBox.fill(EDITED);
  await page.evaluate(() => document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a[href^="https://wa.me"]')) e.preventDefault();
  }));
  await bulkLink.click();
  await page.waitForTimeout(1500);
  const body = posted.length ? JSON.parse(posted[0] || '{}') : {};
  check(`${size}: the tap records the edited words`, body.text === EDITED, JSON.stringify(body).slice(0, 80));
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
