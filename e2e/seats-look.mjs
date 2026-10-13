#!/usr/bin/env node
/**
 * e2e/seats-look.mjs — QA F6: the seat map across the whole day and in one shift, at
 * 360 and 1280 px, against a live stack. A room with Morning (06–12), Evening (12–18)
 * and Full day (06–22), two halls, and:
 *
 *   A1  Asha (Morning) + Imran (Evening)   → whole day "Full", both in the panel
 *   A2  Rahul (Full day)                   → Morning view "Other shift"
 *   A3  Neha (Evening)                     → whole day "Evening"; Morning view "Free"
 *
 * Measures as well as reads: nothing wider than the viewport, and no tile's words
 * spilling out of the tile (the class of defect getByRole cannot see).
 */
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/seats-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const user = await newUser({ name: 'Room Owner' });
const t = await must('POST', '/tenants', { name: `Reading Room ${uniq()}`, state_code: '27', apps: ['library'] }, user.token);
user.token = t.access_token ?? user.token;
for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
const plan = await must('POST', '/library/membership-types', { name: 'Monthly', validity_months: 1, fee_amount: '900.00' }, user.token);
const shifts = {};
for (const [name, starts_at, ends_at] of [['Morning', '06:00', '12:00'], ['Evening', '12:00', '18:00'], ['Full day', '06:00', '22:00']]) {
  shifts[name] = (await must('POST', '/library/shifts', { name, starts_at, ends_at }, user.token)).id;
}
const seats = {};
for (const row of [{ prefix: 'A', from: 1, to: 8, zone: 'AC hall' }, { prefix: 'B', from: 1, to: 4, zone: 'Quiet room' }]) {
  for (const s of await must('POST', '/library/seats/row', row, user.token)) seats[s.label] = s.id;
}
const admit = async (name, seat, shift, paid = '900.00') => {
  const party = await addParty(user.token, { name, mobile: uniqMobile() });
  const body = { membership_type_id: plan.id, party_id: party.id, seat_id: seats[seat], shift_id: shifts[shift] };
  if (paid) body.collect_fees = { mode_breakup: [{ mode: 'cash', amount: paid }] };
  return must('POST', '/library/members', body, user.token);
};
await admit('Asha Kulkarni', 'A1', 'Morning');
await admit('Imran Khan', 'A1', 'Evening', null);
await admit('Rahul Verma', 'A2', 'Full day');
await admit('Neha Joshi', 'A3', 'Evening');

const tileWord = async (page, label) =>
  (await page.getByTestId(`seat-${label}`).innerText()).replace(/\s+/g, ' ').trim();
const spill = (page) =>
  page.evaluate(() => {
    const bad = [];
    for (const tile of document.querySelectorAll('[data-testid^="seat-"]')) {
      const box = tile.getBoundingClientRect();
      for (const span of tile.querySelectorAll('span')) {
        const r = span.getBoundingClientRect();
        if (r.width && (r.left < box.left - 1 || r.right > box.right + 1 || span.scrollWidth > span.clientWidth + 1))
          bad.push(`${tile.dataset.testid}:${span.textContent}`);
      }
    }
    return bad;
  });

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});

  await page.goto(`${FRONTEND}/library/seats`, { waitUntil: 'networkidle' });
  await page.getByTestId('library-seats-screen').waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${OUT}/${w}-day.png`, fullPage: true });
  record(`${w}: whole day is the default — A1 Full`, (await tileWord(page, 'A1')).includes('Full'), await tileWord(page, 'A1'));
  record(`${w}: A3 says Evening`, (await tileWord(page, 'A3')).includes('Evening'), await tileWord(page, 'A3'));
  record(`${w}: A4 says Free`, (await tileWord(page, 'A4')).includes('Free'), await tileWord(page, 'A4'));
  const counts = await page.getByTestId('library-seats-counts').innerText();
  record(`${w}: per-shift counts`, counts.includes('Morning 2/12') && counts.includes('Evening 3/12') && counts.includes('Full day 3/12'), counts);
  const legend = await page.getByTestId('library-seats-legend').innerText();
  record(`${w}: the legend names every colour`, ['Free', 'Part taken', 'Full', 'Paid', 'Unpaid'].every((x) => legend.includes(x)), legend.replace(/\s+/g, ' ').slice(0, 100));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${w}: whole day fits the screen`, over <= 0, `${over}px`);
  const spilled = await spill(page);
  record(`${w}: no tile's words spill out`, spilled.length === 0, spilled.join(', '));

  await page.getByTestId('seat-A1').click();
  const panel = await page.getByTestId('library-seat-detail').innerText();
  await page.getByTestId('library-seat-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${w}-panel.png`, fullPage: true });
  record(`${w}: A1's panel lists both students with their hours`,
    panel.includes('Asha Kulkarni') && panel.includes('Imran Khan') && panel.includes('Morning 06:00–12:00') && panel.includes('Evening 12:00–18:00'),
    panel.replace(/\s+/g, ' ').slice(0, 160));

  await page.getByRole('button', { name: /^Shift: Whole day/ }).click();
  await page.getByRole('option', { name: /^Morning/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${w}-morning.png`, fullPage: true });
  record(`${w}: in the Morning, A2 (Full day) says Other shift`, (await tileWord(page, 'A2')).includes('Other shift'), await tileWord(page, 'A2'));
  record(`${w}: in the Morning, A3 (Evening only) is Free`, (await tileWord(page, 'A3')).includes('Free'), await tileWord(page, 'A3'));
  await page.getByTestId('seat-A3').click();
  const a3 = await page.getByTestId('library-seat-detail').innerText();
  record(`${w}: A3's panel still names its evening student`, a3.includes('Neha Joshi'), a3.replace(/\s+/g, ' ').slice(0, 100));
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${w}: shift view fits the screen`, over2 <= 0, `${over2}px`);
  const spilled2 = await spill(page);
  record(`${w}: no tile's words spill out (shift view)`, spilled2.length === 0, spilled2.join(', '));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall seat checks passed');
process.exit(failed ? 1 : 0);
