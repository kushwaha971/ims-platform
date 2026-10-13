#!/usr/bin/env node
/**
 * e2e/import-look.mjs — the 12 Oct QA import findings on a live stack, at 360 and
 * 1280 px: a party file with good and bad rows mixed and a name the book already has.
 *
 *  · B32: a small file is checked by the time the upload answers — no 30 s queue.
 *  · B27: the totals count the good rows only; the problem rows' money is said apart.
 *  · B28: a name already in the book is a choice (skip by default).
 *  · B34: every row pages through, and "Only rows with problems" filters.
 *  · B33/B44: the button says "Import 3 good rows, skip 2"; pressing it creates only
 *    the good rows, and the page reaches "completed" on its own (B31).
 *  · Nothing wider than the screen.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { addParty, must, newUser, uniq } from './lib/fixtures.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '/tmp/import-look';
let failed = 0;
const record = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const fits = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} fits the screen`, over <= 0, `${over}px`);
};

const FILE = `${OUT}/parties.csv`;
writeFileSync(
  FILE,
  [
    'name,mobile,type,opening_balance,opening_type,opening_date,gstin,state,tags',
    'Ramesh Traders,9876500001,customer,1000,to_receive,01/04/2025,,,',
    'Sunita Stores,9876500002,supplier,250.50,to_pay,01/04/2025,,,',
    'Old Customer,,customer,,,,,,',
    'X,9876500004,customer,1300,to_receive,01/04/2025,,,',
    'Meena Devi,9876500005,customer,500,,01/04/2025,,,',
  ].join('\n')
);

const browser = await chromium.launch();
for (const [w, h] of [[360, 780], [1280, 900]]) {
  const user = await newUser({ name: 'Shop Owner' });
  const t = await must('POST', '/tenants', { name: `Shop ${uniq()}`, state_code: '27', business_type: 'retail' }, user.token);
  user.token = t.access_token ?? user.token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, user.token);
  await addParty(user.token, { name: 'Old Customer' });

  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 }).catch(() => {});

  await page.goto(`${FRONTEND}/imports?kind=parties`, { waitUntil: 'networkidle' });
  const started = Date.now();
  await page.locator('input[type="file"]').setInputFiles(FILE);
  await page.getByTestId('import-commit').waitFor({ timeout: 30000 });
  const waited = Math.round((Date.now() - started) / 1000);
  record(`${w}: checked in seconds, not after the queue (B32)`, waited < 15, `${waited} s`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${w}-review.png`, fullPage: true });
  const body = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: the total is the good rows' (B27)`, body.includes('₹1,000.00'), body.match(/You will get[^.]*\./)?.[0] ?? '');
  record(`${w}: the problem rows' money is said apart`, body.includes('₹1,300.00 is in rows with problems'));
  record(`${w}: a name in the book is a choice (B28)`, body.includes('1 row is already in your book') && body.includes('Skip them'));
  const button = await page.getByTestId('import-commit').innerText();
  record(`${w}: the button imports the good rows and skips the bad (B33)`, /Import 3 good rows, skip 2/.test(button), button);
  await page.getByRole('button', { name: 'Only rows with problems' }).click();
  await page.waitForTimeout(800);
  const rows = (await page.getByTestId('import-rows-review').innerText()).replace(/\s+/g, ' ');
  record(`${w}: only problems shows the bad rows and the duplicate (B34)`, rows.includes('Meena Devi') && !rows.includes('Ramesh Traders'), rows.slice(0, 120));
  await fits(page, `${w}: review`);

  await page.getByTestId('import-commit').click();
  await page.getByText(/completed|Import complete|imported/i).first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${w}-done.png`, fullPage: true });
  const parties = await must('GET', '/parties?page_size=50', null, user.token);
  const names = parties.map((p) => p.name).sort();
  record(`${w}: only the good rows were created; the duplicate skipped`, JSON.stringify(names) === JSON.stringify(['Old Customer', 'Ramesh Traders', 'Sunita Stores']), names.join(', '));
  const done = (await page.innerText('body')).replace(/\s+/g, ' ');
  record(`${w}: the page finished on its own (B31)`, !/Importing \d+ rows/.test(done), done.slice(0, 100));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall import checks passed');
process.exit(failed ? 1 : 0);
