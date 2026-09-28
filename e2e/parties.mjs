#!/usr/bin/env node
/**
 * e2e/parties.mjs — the party list's filters, against a real browser and a real
 * server.
 *
 * It exists because of one defect, and the defect is worth stating because it
 * is the kind this file is for.
 *
 * PTY-02 added three chip filters. Every unit test passed: the chips rendered,
 * `aria-pressed` flipped, the thunk was dispatched with the right parameters,
 * "Clear filters (1)" appeared and the count tile relabelled itself "Matching
 * your filters". In the browser, tapping a chip issued **no request at all**
 * and the list did not change. `partyListRequestKey` — the warm-up's idea of
 * "the same request" — named its fields and had never heard of `balance`, so a
 * filtered arg hashed to the same key as the speculative page-1 request,
 * `claimWarmPartyList` answered "already in flight", and the hook returned
 * without dispatching. jsdom could not see it: the unit tests prime no warm-up,
 * so the claim always returns false there and the dispatch they assert really
 * does happen.
 *
 * So the checks here are deliberately about the NETWORK and the RESULT, not
 * about the controls. A chip that lights up is not a chip that filters.
 *
 * PTY-04 added a third: archiving is the one action in the parties module that
 * makes a row LEAVE the screen, and "did the row actually go" is a question
 * only a real list against a real server can answer.
 *
 * PTY-03 added a second reason. `onRowOpen` reached the grid's CARD rendering
 * and stopped there, so a party was openable on a phone and not on a laptop —
 * and every test that exercised row opening rendered the cards tier, the one
 * tier where it worked. The desktop check below is that gap, at the width the
 * defect lived at.
 *
 *   node e2e/parties.mjs
 *   node e2e/parties.mjs --shots
 *
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

const stamp = Date.now();
const OWNER = {
  email: `parties-${stamp}@shop.test`,
  password: 'Dukaan2026x',
  name: 'Owner Person',
};

/**
 * A book with a known shape, so the assertions can be about NUMBERS.
 *
 * ── Every balance here is ₹0.00, and that is the product, not the fixture ───
 * A party's `balance` is derived from its ledger entries; it is not writable,
 * and `PartyWriteSerializer`'s allowlist does not include it. PTY-01's opening
 * balance is recorded and deliberately NOT posted — LED-02 consumes it, and a
 * backend test asserts the balance stays 0.00 so that the two are not wired
 * together early and every opening balance posted twice.
 *
 * So until LED-02 there is no way to give a party money through any API this
 * suite is allowed to use. An earlier draft of this file posted balances
 * anyway, watched the server ignore them, and then failed its own assertions.
 * The checks below are therefore about the filters being APPLIED and the server
 * and screen AGREEING — "Owes me" finding nobody in a book where nobody owes
 * anything is a correct and checkable answer. When LED-02 lands, this fixture
 * grows entries and the money assertions come with them.
 */
const BOOK = [
  { name: 'Aarav Traders', is_customer: true, is_supplier: false },
  { name: 'Bhavna Stores', is_customer: true, is_supplier: false },
  { name: 'Chetan Mart', is_customer: true, is_supplier: true },
  { name: 'Divya Agency', is_customer: true, is_supplier: true },
  { name: 'Esha & Sons', is_customer: true, is_supplier: false },
  { name: 'Farhan Supply', is_customer: true, is_supplier: false },
];
const SETTLED_ZERO = '₹0.00';

const post = async (path, body, token, extra = {}) => {
  const response = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'api',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${path} ${response.status}: ${await response.text()}`);
  return response.json();
};

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
  const token = registered.data.access_token;
  await post(
    '/tenants',
    { name: 'Kumar Stores', business_type: 'retail', state_code: '27' },
    token,
    { 'Idempotency-Key': `tenant-${stamp}` }
  );

  /* A SECOND sign-in, and not a redundant one: the token from `/auth/register`
     was minted before the business existed, so it carries no tenant and every
     module-gated endpoint answers 403 with it. Signing in again picks up the
     membership that `POST /tenants` just created. */
  const scoped = await post('/auth/login', {
    email: OWNER.email,
    password: OWNER.password,
  });
  const tenantToken = scoped.data.access_token;

  for (const [index, party] of BOOK.entries()) {
    await post('/parties', party, tenantToken, {
      'Idempotency-Key': `party-${stamp}-${index}`,
    });
  }
  return tenantToken;
}

const signIn = async (page) => {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('input[type="email"], input[name="email"]', OWNER.email);
  await page.fill('input[type="password"], input[name="password"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
};

const shot = async (page, name) => {
  if (!wantShots) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/parties-${name}.png`, fullPage: true });
};

async function run() {
  await seed();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  /** Every list request the page makes, in order, so a missing one is visible. */
  const listRequests = [];
  page.on('request', (r) => {
    const url = r.url();
    if (url.includes('/parties?')) listRequests.push(url.split('/api/v1')[1]);
  });

  await signIn(page);
  await page.goto(`${FRONTEND}/parties`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
  await page.waitForTimeout(1200);

  const totals = () => page.locator('[data-testid="ub-stat-grid"]').innerText();

  // ── The header answers the question the screen exists for ─────────────────
  {
    const text = await totals();
    record(
      'the totals come from the server, counting every party in the book',
      text.includes(SETTLED_ZERO) && text.includes(String(BOOK.length)),
      text.replace(/\n/g, ' | ')
    );
    record(
      'and say so, rather than claiming to be the page sum',
      text.includes('Across everyone in this list'),
      text.replace(/\n/g, ' | ')
    );
    await shot(page, '01-loaded');
  }

  // ── A chip must reach the SERVER, not just the pressed state ──────────────
  for (const [label, expected, rows] of [
    // Nobody owes anything yet (see BOOK), so these two find nobody — which is
    // the server and the screen agreeing, and is exactly what breaks when a
    // filter silently fails to leave the device.
    ['Owes me', 'balance=owes_me', 0],
    ['I owe them', 'balance=i_owe', 0],
    ['Settled', 'balance=settled', BOOK.length],
    ['Suppliers', 'type=supplier', 2],
    ['Customers', 'type=customer', BOOK.length],
  ]) {
    const before = listRequests.length;
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(1500);
    const issued = listRequests.slice(before);

    record(
      `tapping "${label}" issues a request carrying ${expected}`,
      issued.some((url) => url.includes(expected)),
      issued.length ? issued.join(' , ') : 'NO REQUEST WAS MADE'
    );

    /* Excluding the state row. An empty result is still a `<tr>` — it has to
       be, or the table's column structure collapses — so a bare `tbody tr`
       count reports 1 for a list that found nobody, and an assertion of "1 row"
       would pass on an empty screen. */
    const count = await page
      .locator('tbody tr:not([data-testid="ub-grid-state-row"])')
      .count();
    record(
      `and the list actually narrows to ${rows}`,
      count === rows,
      `${count} row(s) on screen`
    );

    // Off again, so each filter is measured on its own.
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(1200);
  }

  // ── The money tiles are the same control as the chips ─────────────────────
  {
    const before = listRequests.length;
    await page.getByRole('button', { name: 'Show only who owes me' }).click();
    await page.waitForTimeout(1500);
    const issued = listRequests.slice(before);

    record(
      'the receivable tile applies the balance filter',
      issued.some((url) => url.includes('balance=owes_me')),
      issued.length ? issued.join(' , ') : 'NO REQUEST WAS MADE'
    );
    record(
      'and the matching chip says the list is narrowed',
      (await page.getByRole('button', { name: 'Owes me', exact: true }).getAttribute('aria-pressed')) === 'true',
      'a filter applied with nothing on screen saying so reads as missing parties'
    );

    const text = await totals();
    record(
      'and the totals follow the filter rather than the whole book',
      text.includes('Matching your filters') && text.includes('0'),
      text.replace(/\n/g, ' | ')
    );
    await shot(page, '02-filtered');

    /* The bar's control, by its exact label: the filtered-empty state offers a
       "Clear filters" of its own, and a loose match hits both. */
    await page.getByRole('button', { name: 'Clear filters (1)' }).click();
    await page.waitForTimeout(1200);
  }

  // ── The empty state says which way the merchant got there ─────────────────
  {
    await page.getByRole('button', { name: 'Owes me', exact: true }).click();
    await page.waitForTimeout(1600);

    const body = await page.locator('body').innerText();
    record(
      'a chip that matched nothing does not tell the merchant to clear a search',
      body.includes('No customers match these filters') && !body.includes('Clear the search'),
      body.includes('No customers match this search') ? 'it said "this search"' : 'ok'
    );
    await shot(page, '03-empty');
  }

  // ── PTY-03 — the list now leads somewhere ─────────────────────────────────
  {
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
    await page.waitForTimeout(1000);

    /* `Open (?!menu)` because the mobile nav's own "Open menu" button matches a
       bare `^Open ` and is the first one in the document. */
    const open = page.getByRole('button', { name: /^Open (?!menu)/ }).first();
    const label = (await open.getAttribute('aria-label')) ?? '';
    const name = label.replace(/^Open /, '');

    record(
      'a row on the DESKTOP table can be opened at all',
      Boolean(name),
      name || 'no row-open control was rendered above the cards tier'
    );

    await open.click();
    await page.waitForURL(/\/parties\/[0-9a-f-]+$/, { timeout: 15000 }).catch(() => {});

    record(
      'and it opens that party',
      /\/parties\/[0-9a-f-]+$/.test(page.url()),
      page.url()
    );

    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();

    record('the khata page names the party it opened', body.includes(name), name);
    record(
      'and states the balance in the merchant\u2019s own words',
      /You will (get|give)|Settled/.test(body),
      body.slice(0, 160).replace(/\n/g, ' | ')
    );
    record(
      'with no minus sign on it \u2014 the label carries the direction',
      !/[\u2212-]\u20b9/.test(body),
      'a balance is never signed (\u00a723.2.6 rule 3)'
    );
    await shot(page, '04-detail');
  }

  // ── An id that does not exist is a different screen, not a retry ──────────
  {
    await page.goto(`${FRONTEND}/parties/01a0c000-0000-7000-8000-000000000000`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();

    record(
      'an unknown party is a not-found screen with a way back',
      body.includes('This party was not found') && body.includes('Back to customers'),
      body.slice(0, 160).replace(/\n/g, ' | ')
    );
    record(
      'and offers no Try again, because retrying cannot help',
      !body.includes('Try again'),
      'a button that cannot work teaches the merchant the app is broken'
    );
  }

  // ── PTY-04 — archiving, and the guard that is the whole feature ───────────
  //
  // Every party in BOOK is settled (their balances are all ₹0.00, because
  // nothing can post a ledger entry yet), so the happy path is reachable and
  // the blocked path is not. The blocked path has backend tests that set a
  // balance directly; here the point is that the flow works end to end and
  // that the row actually leaves the list.
  {
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
    await page.waitForTimeout(1000);

    const open = page.getByRole('button', { name: /^Open (?!menu)/ }).first();
    const name = ((await open.getAttribute('aria-label')) ?? '').replace(/^Open /, '');
    await open.click();
    await page.waitForURL(/\/parties\/[0-9a-f-]+$/, { timeout: 15000 });
    await page.waitForTimeout(1500);

    await openHeaderMenu(page);
    const archiveButton = page.getByRole('button', { name: 'Archive' });
    record(
      'the khata page offers to archive the party',
      (await archiveButton.count()) > 0,
      name
    );

    await archiveButton.click();
    const dialog = await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const dialogText = await dialog.innerText();

    /**
     * The copy rule is "never the word delete anywhere in this feature",
     * because the product does not delete parties and saying so is what
     * prevents the support question. The FRD's own copy for this dialog is
     * "Nothing is deleted." — the rule and the string it ships contradict each
     * other, and the string is the one that is right: the merchant's question
     * at this moment is "am I deleting this person", and the only sentence that
     * answers it has to use the word in order to negate it.
     *
     * So what is checked is what the rule protects: no CONTROL is ever labelled
     * delete, and the word appears only where it is being denied.
     */
    const deleteWords = (dialogText.match(/delete\w*/gi) ?? []).map((w) => w.toLowerCase());
    record(
      'it asks first, and the only "delete" on screen is the one being denied',
      dialogText.includes(`Archive ${name}?`) &&
        deleteWords.every((word) => word === 'deleted') &&
        dialogText.includes('Nothing is deleted'),
      deleteWords.join(', ') || 'none'
    );
    record(
      'and no control is labelled delete',
      (await page.getByRole('dialog').getByRole('button', { name: /delete/i }).count()) === 0,
      'the product has no hard delete, so no button may offer one'
    );

    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
    await page.waitForTimeout(2500);

    const afterBody = await page.locator('body').innerText();
    record(
      'the party is archived and the page says so',
      afterBody.includes('This party is archived'),
      afterBody.slice(0, 120).replace(/\n/g, ' | ')
    );
    record(
      'and offers to bring them back',
      (await page.getByRole('button', { name: 'Restore' }).count()) > 0,
      'restore is the way out, and it is on the banner that explains the state'
    );
    await shot(page, '05-archived');

    // It really leaves the working list.
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
    record(
      'and it is gone from the list the merchant works in',
      (await page.getByRole('button', { name: `Open ${name}` }).count()) === 0,
      name
    );
    record(
      'but is still there under Archived \u2014 hidden, never deleted',
      await (async () => {
        await page.getByRole('combobox', { name: 'Show' }).click();
        await page.getByRole('option', { name: 'Archived' }).click();
        await page.waitForTimeout(1500);
        return (await page.getByRole('button', { name: `Open ${name}` }).count()) > 0;
      })(),
      name
    );
  }

  await ctx.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? `\n         ${r.detail}` : ''}`);
  }
  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(`${SHOT_DIR}/parties-results.json`, JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });
