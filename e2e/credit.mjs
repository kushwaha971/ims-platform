#!/usr/bin/env node
/**
 * e2e/credit.mjs — PTY-06's credit limits, against a real browser and a real
 * server, plus the screenshot sweep that goes with it.
 *
 * ── What only a live stack can answer ──────────────────────────────────────
 *
 *   1. The usage bar renders the SERVER's percentage. It is computed with
 *      `Decimal` there and arrives as an integer, precisely so the client never
 *      divides two floats parsed from decimal strings (canon rule 3). A test
 *      that mocks the service asserts the component; only a real response
 *      asserts that the two ends agree about what 47,500 of 50,000 is.
 *   2. The "Over limit (n)" chip's count comes from `meta.totals.over_limit`,
 *      which rides in the same aggregate as the money totals. A count that is
 *      computed but never reaches the chip is a chip that never appears.
 *   3. `?credit=over` reaches the wire and narrows the list — the same class of
 *      defect `e2e/parties.mjs` exists for: a chip that lights up is not a chip
 *      that filters.
 *   4. The pre-flight answers before a merchant has finished typing, and
 *      refuses nothing. It is the endpoint LED-01 will call; today it is the
 *      only way to see the rule work end to end, because there is no write that
 *      grants credit yet.
 *
 * ── What is deliberately NOT here ──────────────────────────────────────────
 * The warning dialog, the override and "Ask owner". All three are about a write
 * that can be refused, and `apps/ledger` and `apps/sales` have no tables — so
 * there is no operation to guard. The rule they would guard with is complete
 * and tested; the guard itself arrives with LED-01.
 *
 *   ./e2e/serve-api.sh && ./e2e/serve.sh
 *   node e2e/credit.mjs
 *   node e2e/credit.mjs --shots
 *
 * If registration answers 429 see the note in `tags.mjs`: `register_ip` is a
 * DB-backed budget that does not clear on a server restart.
 *
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots/credit';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

const stamp = Date.now();
const OWNER = {
  email: `credit-${stamp}@shop.test`,
  password: 'Dukaan2026x',
  name: 'Owner Person',
};

/**
 * A book shaped so every band is on screen at once.
 *
 * Balances are set through the ORM rather than the API, because `balance` is
 * derived from ledger entries and is deliberately not writable — PTY-01's
 * opening balance is recorded and NOT posted until LED-02. The harness reaches
 * for `manage.py shell` for exactly this reason, and says so here so the next
 * reader does not go looking for an endpoint that should exist and does not.
 */
const BOOK = [
  { name: 'Aarav Traders', limit: '50000.00', balance: '10000.00', band: 'ok' },
  { name: 'Bhavna Stores', limit: '50000.00', balance: '40000.00', band: 'near' },
  { name: 'Chetan Mart', limit: '50000.00', balance: '51700.00', band: 'over' },
  { name: 'Divya Agency', limit: '5000.00', balance: '9000.00', band: 'over' },
  { name: 'Esha & Sons', limit: null, balance: '90000.00', band: 'none' },
  { name: 'Farhan Supply', limit: '20000.00', balance: '-2000.00', band: 'advance' },
];

const api = async (method, path, body, token, extra = {}) => {
  const response = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'api',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
};

const post = (path, body, token, extra) => api('POST', path, body, token, extra);
const get = (path, token) => api('GET', path, null, token);

/**
 * Open the khata header's overflow menu.
 *
 * Edit, Add opening balance and Archive moved behind it in LED-02, when the
 * action row reached five buttons and ran 275 px off the right edge of a 360 px
 * phone. This harness reached past the menu because it did not exist yet; it
 * opens it the way a merchant does now.
 */
const openHeaderMenu = async (page) => {
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.waitForTimeout(600);
};

async function seed() {
  const registered = await post('/auth/register', {
    email: OWNER.email,
    password: OWNER.password,
    full_name: OWNER.name,
  });
  await post(
    '/tenants',
    { name: 'Kumar Stores', business_type: 'retail', state_code: '27' },
    registered.data.access_token,
    { 'Idempotency-Key': `tenant-${stamp}` }
  );
  const scoped = await post('/auth/login', {
    email: OWNER.email,
    password: OWNER.password,
  });
  const token = scoped.data.access_token;

  const created = [];
  for (const [index, party] of BOOK.entries()) {
    const made = await post(
      '/parties',
      {
        name: party.name,
        is_customer: true,
        is_supplier: false,
        ...(party.limit ? { credit_limit: party.limit, credit_days: 30 } : {}),
      },
      token,
      { 'Idempotency-Key': `party-${stamp}-${index}` }
    );
    created.push({ ...party, id: made.data.id });
  }
  return { token, parties: created };
}

/**
 * Sign in, and do not return until the app agrees that it worked.
 *
 * A fixed `waitForTimeout` after pressing Log in was enough most of the time
 * and not all of it: the sweep signed in on a throwaway page, closed it, and
 * the next page landed back on /login — producing four screenshots of the sign-
 * in screen labelled "the party list". Waiting for the destination is the only
 * condition that means what the step is trying to assert.
 */
const settle = (page, ms = 900) => page.waitForTimeout(ms);

const signIn = async (page) => {
  /**
   * Signed in, and VERIFIED — not "clicked Log in and waited two seconds".
   *
   * The fixed wait was enough most of the time and not all of it, which is the
   * worst kind of enough: the sweep then produced screenshots of the SIGN-IN
   * SCREEN labelled "the party list", and nothing failed. `waitForURL` was the
   * first fix and the wrong one — its default `waitUntil: 'load'` is a state
   * this app can legitimately never reach, because a connectivity probe keeps
   * the network busy.
   *
   * So the condition is the thing the caller actually needs: the party grid, on
   * the party list. One retry, because a cold route can lose the first attempt
   * and a harness that gives up on it reports a product defect that is not one.
   */
  for (const attempt of [1, 2]) {
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.fill('input[type="email"], input[name="email"]', OWNER.email);
    await page.fill('input[type="password"], input[name="password"]', OWNER.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${FRONTEND}/parties`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    try {
      await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 20000 });
      await page.waitForTimeout(600);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
};

const openList = async (page, query = '') => {
  await page.goto(`${FRONTEND}/parties${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 45000 });
  await settle(page, 1200);
};

// ── The sweep ───────────────────────────────────────────────────────────────

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
];

const shots = [];
const missed = [];

const capture = async (page, size, name) => {
  if (!wantShots) return;
  const dir = `${SHOT_DIR}/${size.id}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  shots.push(`${size.id}/${name}.png`);
};

const step = async (label, page, fn) => {
  try {
    await fn();
  } catch (error) {
    missed.push(`${label}: ${String(error).split('\n')[0]}`);
    const dir = `${SHOT_DIR}/_failures`;
    mkdirSync(dir, { recursive: true });
    await page
      .screenshot({ path: `${dir}/${label.replace(/\s+/g, '-')}.png`, fullPage: true })
      .catch(() => undefined);
  }
};

async function sweep(ctx, size, parties) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: size.width, height: size.height });
  const at = (name, fn) => step(`${size.id} ${name}`, page, fn);

  /* On THIS page rather than a throwaway one that is then closed: closing the
     page that signed in raced the session being persisted, and the next
     navigation landed back on /login. */
  await signIn(page);

  await at('list', async () => {
    await openList(page);
    await capture(page, size, '01-list-with-over-limit-chip');
  });

  await at('over', async () => {
    await openList(page, '?credit=over');
    await capture(page, size, '02-list-filtered-to-over-limit');
  });

  await at('near', async () => {
    await openList(page, '?credit=near');
    await capture(page, size, '03-list-filtered-to-near-limit');
  });

  for (const [name, file] of [
    ['Aarav Traders', '04-khata-bar-well-inside'],
    ['Bhavna Stores', '05-khata-bar-near-limit'],
    ['Chetan Mart', '06-khata-bar-over-limit'],
    ['Farhan Supply', '07-khata-party-paid-an-advance'],
    ['Esha & Sons', '08-khata-no-limit-no-bar'],
  ]) {
    await at(file, async () => {
      const party = parties.find((row) => row.name === name);
      await page.goto(`${FRONTEND}/parties/${party.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await settle(page, 1800);
      await capture(page, size, file);
    });
  }

  await at('form-hint', async () => {
    const party = parties.find((row) => row.name === 'Chetan Mart');
    await page.goto(`${FRONTEND}/parties/${party.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await settle(page, 1600);
    await openHeaderMenu(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await settle(page, 1200);
    /* The Credit disclosure starts CLOSED — everything past the first three
       fields does, because it is in the way of somebody adding their fourth
       customer of the morning (PTY-01). Opened by its exact label, because
       `/^Credit/i` also matches the "Credit limit" field's own label once the
       section is open, and a regex that matches two different things picks
       whichever the DOM happens to hold first. */
    await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
    await settle(page, 800);
    await capture(page, size, '09-form-credit-section');
    /* `UbMoneyInput` renders a spinbutton rather than a textbox — it is a
       number field with grouping, not free text. */
    const limit = page
      .getByRole('spinbutton', { name: /Credit limit/i })
      .or(page.getByRole('textbox', { name: /Credit limit/i }))
      .first();
    await limit.fill('1000');
    await limit.blur();
    await settle(page, 900);
    /* Scroll the HINT into view before photographing it, and fail the step if
       it is not there.

       The first version of this sweep did neither, and produced four
       screenshots named `10-form-limit-already-crossed` in which the hint does
       not appear anywhere: the drawer has its own scroll container, so
       `fullPage: true` photographs the page behind it and the drawer at
       whatever scroll offset it happens to hold — which, on open, is the top.
       The check below asserted the text and passed, the picture was captioned
       "already crossed", and the one thing the picture was for was off the
       bottom of it.

       `scrollIntoViewIfNeeded` on the hint rather than on the field, because
       the hint sits UNDER the field and a field scrolled just into view leaves
       its hint clipped — which is the same defect one line lower down. */
    const hint = page.getByText(/already owe .* this limit is already crossed/i).first();
    await hint.waitFor({ state: 'visible', timeout: 10000 });
    await hint.scrollIntoViewIfNeeded();
    await settle(page, 400);
    await capture(page, size, '10-form-limit-already-crossed');
  });

  await page.close();
}

// ── The checks ──────────────────────────────────────────────────────────────

async function checks(browser, token, parties) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const listRequests = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.includes('/api/v1/parties?')) return;
    listRequests.push(decodeURIComponent(url.split('/api/v1')[1].replace(/\+/g, '%20')));
  });

  await signIn(page);
  await openList(page);

  // 1. The chip exists, and it carries the count from `meta.totals`.
  {
    const chip = page.getByRole('button', { name: /^Over limit \(/ });
    const label = (await chip.count()) > 0 ? await chip.first().innerText() : '(absent)';
    record('the over-limit chip carries the server’s count', label === 'Over limit (2)', label);
  }

  // 2. Tapping it reaches the wire and narrows the list.
  {
    const before = listRequests.length;
    await page.getByRole('button', { name: /^Over limit \(/ }).first().click();
    await settle(page, 1500);
    const issued = listRequests.slice(before);
    record(
      'tapping it issues a request carrying credit=over',
      issued.some((url) => url.includes('credit=over')),
      issued.join(' | ') || '(no request issued)'
    );

    const grid = await page.locator('[data-testid="ub-grid"]').innerText();
    record(
      'and the list narrows to exactly the two parties past their limit',
      grid.includes('Chetan Mart') &&
        grid.includes('Divya Agency') &&
        !grid.includes('Aarav Traders'),
      grid.split('\n').slice(0, 8).join(' | ')
    );
    record(
      'and a party with no limit is not in it, however much they owe',
      !grid.includes('Esha & Sons'),
      ''
    );
  }

  // 2b. Narrowing to a band does not take the band's own controls away.
  //
  // `over_limit` counts the FILTERED set, so `?credit=near` comes back with
  // zero over — and the group's "only when there is something to act on" rule
  // then hid the three chips the merchant had just used. Only a live server
  // produces that zero; every component test hands the count in by hand.
  {
    await openList(page, '?credit=near');
    const near = page.getByRole('button', { name: 'Near limit' });
    const present = (await near.count()) > 0;
    record(
      'narrowing to Near limit leaves its own chips on screen',
      present && (await near.first().getAttribute('aria-pressed')) === 'true',
      present ? 'pressed' : '(the whole credit group disappeared)'
    );
    record(
      'and the chip beside it has no "(0)" on a list it does not count',
      (await page.getByRole('button', { name: 'Over limit' }).count()) > 0,
      (await page.getByRole('button', { name: /^Over limit/ }).count()) > 0
        ? await page.getByRole('button', { name: /^Over limit/ }).first().innerText()
        : '(absent)'
    );
  }

  // 3. The bar on the khata page reads the SERVER's percentage.
  {
    const near = parties.find((row) => row.name === 'Bhavna Stores');
    await page.goto(`${FRONTEND}/parties/${near.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await settle(page, 1800);
    const bar = page.getByRole('progressbar');
    const label = (await bar.count()) > 0 ? await bar.first().getAttribute('aria-label') : '';
    record(
      'the khata page draws the bar with the sentence beside it',
      label.includes('₹10,000.00 left of ₹50,000.00'),
      label || '(no bar)'
    );

    const body = await page.locator('body').innerText();
    record(
      'and the caption is on the screen, not only in the accessible name',
      body.includes('₹10,000.00 left of ₹50,000.00'),
      ''
    );
  }

  // 4. Over the limit: the direction is in the wording, never in a minus.
  {
    const over = parties.find((row) => row.name === 'Chetan Mart');
    await page.goto(`${FRONTEND}/parties/${over.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await settle(page, 1800);
    const body = await page.locator('body').innerText();
    record(
      'a party past their limit is told how far over, in words',
      body.includes('₹1,700.00 over the ₹50,000.00 limit'),
      body.split('\n').filter((line) => line.includes('limit')).join(' | ')
    );
    record(
      'and never as a negative amount',
      !body.includes('-₹1,700') && !body.includes('−₹1,700'),
      ''
    );
  }

  // 4b. The edit form warns that the limit being typed is already behind them.
  //
  // Here rather than only in a unit test because three separate things have to
  // line up for a merchant to see it, and each one has already been wrong once:
  // the drawer has to be MOUNTED on this page (it was not — Edit on the khata
  // page dispatched `openEdit` and rendered nothing), the grouped value has to
  // survive `parseAmountInput` before `compareMoney` sees it (it did not above
  // ₹1,000), and the amount has to reach the sentence through `formatAmount`
  // rather than a formatter that carries its own symbol (it did not — "₹₹").
  // Every one of those passed the component test.
  {
    const over = parties.find((row) => row.name === 'Chetan Mart');
    await page.goto(`${FRONTEND}/parties/${over.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await settle(page, 1600);
    await openHeaderMenu(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await settle(page, 1200);
    const drawer = page.getByRole('dialog');
    record(
      'Edit on the khata page opens the form, rather than doing nothing',
      (await drawer.count()) > 0,
      (await drawer.count()) > 0 ? '' : '(no drawer)'
    );
    await page.getByRole('button', { name: 'Credit', exact: true }).first().click();
    await settle(page, 800);
    const hint = page.getByText(/already owe .* this limit is already crossed/i).first();
    const shown = (await hint.count()) > 0;
    const text = shown ? await hint.innerText() : '(absent)';
    record(
      'and it says the stored limit is already behind them, in grouped rupees',
      text.includes('₹51,700.00') && !text.includes('₹₹'),
      text
    );
    // Visible to the eye, not merely present in the tree: the drawer scrolls
    // independently, so an element can be `visible` to Playwright and still be
    // below the fold of the box it lives in.
    await hint.scrollIntoViewIfNeeded().catch(() => undefined);
    const box = await hint.boundingBox();
    record(
      'and it can be brought on screen inside the drawer',
      Boolean(box) && box.y >= 0 && box.y + box.height <= 900,
      box ? `y ${Math.round(box.y)}..${Math.round(box.y + box.height)}` : '(no box)'
    );
    await page.keyboard.press('Escape');
    await settle(page, 600);
  }

  // 5. A party who paid an advance has the WHOLE limit, not more (BR-3, EC-2).
  {
    const advance = parties.find((row) => row.name === 'Farhan Supply');
    const detail = await get(`/parties/${advance.id}`, token);
    const credit = detail.data.credit;
    record(
      'an advance is the customer’s money, not extra credit',
      credit.exposure === '0.00' && credit.available === '20000.00',
      `exposure ${credit.exposure}, available ${credit.available}`
    );
  }

  // 6. The pre-flight, which is the rule itself.
  {
    const near = parties.find((row) => row.name === 'Bhavna Stores');
    const ok = await get(`/parties/${near.id}/credit-check?amount=10000.00`, token);
    const warn = await get(`/parties/${near.id}/credit-check?amount=10000.01`, token);

    record(
      'an amount landing exactly on the limit is allowed',
      ok.data.status === 'ok' && ok.data.over_by === '0.00',
      `${ok.data.status}, over_by ${ok.data.over_by}`
    );
    record(
      'one paisa past it is not',
      warn.data.status === 'warn' && warn.data.over_by === '0.01',
      `${warn.data.status}, over_by ${warn.data.over_by}`
    );
    record(
      'and the owner is told they could override it',
      warn.data.can_override === true,
      String(warn.data.can_override)
    );
  }

  // 7. The pre-flight writes nothing — it answers a question and refuses nothing.
  {
    const over = parties.find((row) => row.name === 'Chetan Mart');
    const before = (await get(`/parties/${over.id}`, token)).data.balance;
    await get(`/parties/${over.id}/credit-check?amount=99999.00`, token);
    const after = (await get(`/parties/${over.id}`, token)).data.balance;
    record('the pre-flight changes nothing', before === after, `${before} -> ${after}`);
  }

  await ctx.close();
}

async function run() {
  const { token, parties } = await seed();

  // `balance` is derived from ledger entries and is deliberately not writable
  // through any API this suite may use, so the fixture reaches for the ORM.
  const { execFileSync } = await import('node:child_process');
  const script = parties
    .map(
      (party) =>
        `Party.objects.filter(pk='${party.id}').update(balance=Decimal('${party.balance}'))`
    )
    .join('\n');
  execFileSync(
    'python',
    [
      'manage.py',
      'shell',
      '-c',
      `from decimal import Decimal\nfrom apps.parties.models import Party\n${script}`,
    ],
    { cwd: '/home/claude/repo/backend', env: { ...process.env, DJANGO_SETTINGS_MODULE: 'config.settings.local' } }
  );

  const browser = await chromium.launch();
  await checks(browser, token, parties);

  if (wantShots) {
    for (const size of SIZES) {
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
      });
      await sweep(ctx, size, parties);
      await ctx.close();
    }
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.check}${r.detail ? `\n        ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (wantShots) {
    mkdirSync(SHOT_DIR, { recursive: true });
    writeFileSync(`${SHOT_DIR}/index.json`, JSON.stringify(shots, null, 2));
    console.log(`\n${shots.length} screenshots in ${SHOT_DIR}`);
    if (missed.length > 0) {
      console.log(`\n${missed.length} captures did not happen:`);
      for (const miss of missed) console.log(`  - ${miss}`);
    }
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
