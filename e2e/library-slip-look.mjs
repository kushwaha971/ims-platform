#!/usr/bin/env node
/**
 * WP-04 M-10 — the issue slip at the library counter is editable. On a live
 * stack, at 360 and 1280 px: a library with one member who has a book out;
 * the counter scans the member, Finish opens "Finish with …?", and:
 *   * the slip sits in an editable box and the WhatsApp link carries it;
 *   * typed Hindi + emoji reach the link unchanged, to the member's number;
 *   * a blank slip removes the link and says why;
 *   * "Use the original message" brings the slip back;
 *   * the member's "Send fee reminder" (WP-04 M-08) opens the prepared words in
 *     the same box, an edit reaches the link, and the tap sends the edited
 *     words as `final_text` so the log keeps what went;
 *   * no page overflow, no page errors.
 * Nothing is sent: the link is read, never followed. Screenshots go to
 * /tmp/e2e-shots/library-slip.
 *
 *   node e2e/library-slip-look.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

import { must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const ROOT = '/tmp/e2e-shots/library-slip';
mkdirSync(ROOT, { recursive: true });
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

const EDITED = 'आशा जी, किताब 2 Nov तक लौटा देना 🙏';

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [size, viewport] of [['phone', { width: 360, height: 780 }], ['desktop', { width: 1280, height: 860 }]]) {
  const user = await newUser({ name: 'Slip QA Owner' });
  const ten = await must('POST', '/tenants', { name: `Slip Library ${uniq()}`, business_type: 'retail', state_code: '27', apps: ['library'] }, user.token);
  user.token = ten.access_token ?? user.token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
  const category = await must('POST', '/library/categories', { name: 'Science' }, user.token);
  const title = await must('POST', '/library/titles', { title: 'Wings of Fire', authors: 'A. P. J. Abdul Kalam', category_id: category.id, copies: { count: 1, price: '250.00' } }, user.token);
  const copies = await must('GET', `/library/copies?title=${title.id}`, null, user.token);
  const copy = (copies.results ?? copies)[0];
  const plan = await must('POST', '/library/membership-types', { name: 'Monthly', fee_amount: '900.00', validity_months: 1 }, user.token);
  const mobile = uniqMobile();
  const party = await must('POST', '/parties', { name: 'Asha Kulkarni', is_customer: true, mobile, state_code: '27' }, user.token);
  const member = await must('POST', '/library/members', { membership_type_id: plan.id, party_id: party.id }, user.token);
  const membershipId = member.membership_id ?? member.id ?? member.membership?.id;
  const number = member.member_number ?? member.membership?.member_number;
  await must('POST', '/library/loans', { membership_id: membershipId, code: copy.accession_number ?? copy.number ?? copy.code }, user.token);

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

  await page.goto(`${FE}/library/counter`, { waitUntil: 'networkidle' });
  const scan = page.getByPlaceholder(/Scan/).first();
  await scan.fill(number);
  await scan.press('Enter');
  await page.getByText('Asha Kulkarni').first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Finish', exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /Finish with Asha/ });
  const box = dialog.getByRole('textbox', { name: 'Message' });
  await box.waitFor({ timeout: 20000 });
  const link = dialog.getByRole('link', { name: 'Send the slip on WhatsApp' });
  const slip = await box.inputValue();
  const linked = async () => new URL((await link.getAttribute('href')) ?? '').searchParams.get('text');
  check(`${size}: the slip names the book`, slip.includes('Wings of Fire'), JSON.stringify(slip.slice(0, 80)));
  check(`${size}: WhatsApp carries the slip`, (await linked()) === slip);
  await look('default');

  await box.fill(EDITED);
  const href = (await link.getAttribute('href')) ?? '';
  check(`${size}: WhatsApp carries the edit exactly`, (await linked()) === EDITED);
  check(`${size}: and goes to the member`, href.startsWith(`https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}`), href.slice(0, 30));
  await look('edited');

  await box.fill(' ');
  check(`${size}: a blank slip has no link`, (await link.count()) === 0);
  check(`${size}: and says why`, await dialog.getByRole('alert').filter({ hasText: 'Write a message before sending.' }).isVisible());
  await look('blank');

  await dialog.getByRole('button', { name: 'Use the original message' }).click();
  check(`${size}: the slip comes back`, (await box.inputValue()) === slip && (await linked()) === slip);
  await page.keyboard.press('Escape');

  // M-08 — the member's fee message, edited before WhatsApp opens.
  const posted = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/library\/members\/[^/]+\/messages?\//.test(new URL(r.url()).pathname)) posted.push(r.postData() ?? '');
  });
  await page.goto(`${FE}/library/members/${membershipId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'More actions' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Send fee reminder' }).or(page.getByRole('menuitem', { name: 'Send fee reminder' })).filter({ visible: true }).first().click();
  const fee = page.getByRole('dialog', { name: /Fee reminder for Asha/ });
  const feeBox = fee.getByRole('textbox', { name: 'Message' });
  await feeBox.waitFor({ timeout: 20000 });
  const feeText = await feeBox.inputValue();
  check(`${size}: the fee message names the amount`, /900/.test(feeText), JSON.stringify(feeText.slice(0, 70)));
  await look('fee-default');
  await feeBox.fill(EDITED);
  const feeLink = fee.getByTestId('library-message-send');
  const feeHref = (await feeLink.getAttribute('href')) ?? '';
  check(`${size}: the fee link carries the edit`, new URL(feeHref).searchParams.get('text') === EDITED);
  check(`${size}: to the member`, feeHref.startsWith(`https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}`), feeHref.slice(0, 30));
  await look('fee-edited');
  await page.evaluate(() => document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a[href^="https://wa.me"]')) e.preventDefault();
  }));
  await feeLink.click();
  await page.waitForTimeout(1500);
  const sentBody = posted.length ? JSON.parse(posted[posted.length - 1] || '{}') : {};
  check(`${size}: the tap records the edited words`, sentBody.final_text === EDITED, JSON.stringify(sentBody).slice(0, 90));
  check(`${size}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
