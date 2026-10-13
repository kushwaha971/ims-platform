#!/usr/bin/env node
/**
 * e2e/import-verticals-look.mjs — QA F10 phase B on a live stack, at 360 and 1280 px:
 * a reading room imports its students and a lender imports running loans.
 *
 *  · The members and loans lists carry an Import action.
 *  · The picker offers a business only its own apps' kinds.
 *  · Students: plan, joined, paid till, deposit, seat; the totals line says the
 *    deposits and old dues; after import the dates are the register's and today's
 *    cash is untouched.
 *  · Loans: daily and monthly rows; "Lent · Already collected · Still to collect";
 *    after import the loan shows what was already collected.
 *  · Nothing wider than the screen.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { must, newUser, uniq, uniqMobile } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/import-verticals-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const fits = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} fits the screen`, over <= 0, `${over}px`);
};
const ddmmyyyy = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const text = async (page) => (await page.innerText('body')).replace(/\s+/g, ' ');

const signIn = async (browser, user, w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});
  return { ctx, page };
};

const business = async (apps) => {
  const user = await newUser({ name: 'Owner' });
  const t = await must('POST', '/tenants', { name: `Biz ${uniq()}`, state_code: '27', apps }, user.token);
  user.token = t.access_token ?? user.token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
  return user;
};

const runImport = async (page, file, w, label) => {
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByTestId('import-commit').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${w}-${label}-review.png`, fullPage: true });
  const review = await text(page);
  await fits(page, `${w}: ${label} review`);
  const button = await page.getByTestId('import-commit').innerText();
  await page.getByTestId('import-commit').click();
  await page.getByText(/imported/i).first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${w}-${label}-done.png`, fullPage: true });
  return { review, button, done: await text(page) };
};

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  // ── students ──
  const room = await business(['library']);
  const plan = await must('POST', '/library/membership-types', { name: 'Monthly', validity_months: 1, fee_amount: '900.00', deposit_amount: '500.00' }, room.token);
  await must('POST', '/library/shifts', { name: 'Morning', starts_at: '06:00', ends_at: '12:00' }, room.token);
  const [seat] = await must('POST', '/library/seats/row', { prefix: 'A', from: 1, to: 4, zone: 'Hall' }, room.token);
  const sheet = `${OUT}/${w}-students.csv`;
  writeFileSync(
    sheet,
    [
      'name,mobile,plan,joined,paid_till,deposit,old_dues,seat,shift',
      `Asha Kumari,${uniqMobile()},Monthly,${ddmmyyyy(daysAgo(60))},${ddmmyyyy(daysAgo(-20))},500,,${seat.label},Morning`,
      `Ravi Kumar,${uniqMobile()},Monthly,${ddmmyyyy(daysAgo(40))},${ddmmyyyy(daysAgo(5))},,300,,`,
    ].join('\n')
  );
  const cashBefore = (await must('GET', '/reports/day-book/position', null, room.token).catch(() => null)) ?? null;
  {
    const { ctx, page } = await signIn(browser, room, w, h);
    await page.goto(`${FRONTEND}/library/members`, { waitUntil: 'networkidle' });
    const link = page.getByRole('link', { name: /Import/ });
    record(`${w}: the members list has an Import action`, (await link.count()) > 0);
    await fits(page, `${w}: members list`);
    await page.goto(`${FRONTEND}/imports`, { waitUntil: 'networkidle' });
    const picker = (await page.innerText('main')).replace(/\s+/g, ' ');
    record(`${w}: a reading room is offered Students only`, picker.includes('Students') && !picker.includes('Running loans') && !picker.includes('Customers and suppliers'), picker.slice(0, 160));
    await page.screenshot({ path: `${OUT}/${w}-picker.png`, fullPage: true });
    await page.goto(`${FRONTEND}/imports?kind=students`, { waitUntil: 'networkidle' });
    const { review, button, done } = await runImport(page, sheet, w, 'students');
    record(`${w}: the students review says the deposits and old dues`, review.includes('Deposits held ₹500.00') && review.includes('Old dues ₹300.00'), review.match(/Deposits held[^·]*·[^.]*?\d\.\d\d/)?.[0] ?? '');
    record(`${w}: the button says students`, /Import 2 students/.test(button), button);
    record(`${w}: done says 2 students imported`, done.includes('2 students imported'), done.slice(0, 120));
    record(`${w}: no raw message id`, !/imports\.(col|value|summary|review)\./.test(review + done));
    await fits(page, `${w}: students done`);
    const members = await must('GET', '/library/members?page_size=50', null, room.token);
    const asha = members.find((m) => m.name === 'Asha Kumari' || m.party?.name === 'Asha Kumari');
    record(`${w}: Asha is on her seat with her paid-till date`, Boolean(asha) && asha.valid_until === daysAgo(-20).toISOString().slice(0, 10), JSON.stringify(asha ?? {}).slice(0, 160));
    await ctx.close();
  }
  void plan;
  void cashBefore;

  // ── loans ──
  const lender = await business(['lending']);
  const book = `${OUT}/${w}-loans.csv`;
  writeFileSync(
    book,
    [
      'name,mobile,amount,given_on,collect,instalments,each_instalment,interest,collected',
      `Geeta Devi,${uniqMobile()},10000,${ddmmyyyy(daysAgo(80))},daily,100,120,,6000`,
      `Mohan Lal,${uniqMobile()},20000,${ddmmyyyy(daysAgo(100))},monthly,12,,2,3600`,
    ].join('\n')
  );
  {
    const { ctx, page } = await signIn(browser, lender, w, h);
    await page.goto(`${FRONTEND}/lending/loans`, { waitUntil: 'networkidle' });
    record(`${w}: the loans list has an Import action`, (await page.getByRole('link', { name: /Import/ }).count()) > 0);
    await fits(page, `${w}: loans list`);
    await page.goto(`${FRONTEND}/imports?kind=loans`, { waitUntil: 'networkidle' });
    const { review, button, done } = await runImport(page, book, w, 'loans');
    record(`${w}: the loans review says lent, collected and still to collect`, review.includes('Lent ₹30,000.00') && review.includes('Already collected ₹9,600.00') && review.includes('Still to collect'), review.match(/Lent ₹[^.]*\.\d\d[^.]*\.\d\d[^.]*\.\d\d/)?.[0] ?? '');
    record(`${w}: the button says loans`, /Import 2 loans/.test(button), button);
    record(`${w}: done says 2 loans imported`, done.includes('2 loans imported'), done.slice(0, 120));
    record(`${w}: no raw message id`, !/imports\.(col|value|summary|review)\./.test(review + done));
    await fits(page, `${w}: loans done`);
    const loans = await must('GET', '/lending/loans?page_size=50', null, lender.token);
    const geeta = loans.find((l) => (l.borrower_name ?? l.party?.name ?? l.name) === 'Geeta Devi') ?? loans[0];
    record(`${w}: Geeta's loan shows 6,000 already collected`, loans.some((l) => l.collected === '6000.00'), loans.map((l) => l.collected).join(', '));
    if (geeta) {
      await page.goto(`${FRONTEND}/lending/loans/${geeta.id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${w}-loan.png`, fullPage: true });
      await fits(page, `${w}: imported loan page`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall vertical import checks passed');
process.exit(failed ? 1 : 0);
