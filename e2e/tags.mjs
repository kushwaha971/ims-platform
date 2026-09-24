#!/usr/bin/env node
/**
 * e2e/tags.mjs — PTY-05's tags, against a real browser and a real server, and
 * the screenshot sweep that goes with it.
 *
 * ── Why this is a separate harness from parties.mjs ────────────────────────
 * Tags change what the LIST REQUEST says, what the ROWS carry, and what a
 * second screen (`/parties/tags`) is for. `parties.mjs` asserts the filter
 * chips reach the network; this one has to assert three more things that only a
 * real stack can answer:
 *
 *   1. `?tag=Camp Area` reaches the server with the NAME intact — the parameter
 *      is a comma list of human-readable names, so anything that url-encodes,
 *      trims or re-cases it in the wrong place produces a filter that silently
 *      matches nothing. A unit test asserting the thunk's argument cannot see
 *      that; the URL on the wire can.
 *   2. A tag created inline in the party FORM exists afterwards. The name goes
 *      out as a string inside the party's own payload and the server resolves
 *      it in the same transaction, so "did a tag row appear" is a question
 *      about two systems agreeing.
 *   3. A rename in the manager changes the chip on the LIST. That is the whole
 *      of US-4, and it is only true because the join stores the id — a client
 *      that cached names anywhere would pass every unit test and show the old
 *      spelling here.
 *
 * ── And the sweep ─────────────────────────────────────────────────────────
 * `--shots` captures every screen this feature touches at four widths and in
 * each of its conditions, including the ones that are easy to never look at:
 * a book with no tags at all, a tag filter that matched nobody, the bulk
 * report with a skipped party, and dark mode.
 *
 *   ./e2e/serve-api.sh && ./e2e/serve.sh    # the stack, the way it has to be served
 *   node e2e/tags.mjs
 *   node e2e/tags.mjs --shots
 *
 * ── If registration answers 429 ────────────────────────────────────────────
 * That is the product working: `register_ip` is a DB-backed budget of twenty
 * per window (`apps/platform_app/services/throttle.py`), and each run of this
 * file spends two. It does NOT clear on a server restart, because the counter
 * is a row rather than a cache entry. In a dev database:
 *
 *   python -c "import django; django.setup(); \
 *     from apps.platform_app.services.throttle import _model; _model().objects.all().delete()"
 *
 *
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots/tags';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

const stamp = Date.now();
const OWNER = {
  email: `tags-${stamp}@shop.test`,
  password: 'Dukaan2026x',
  name: 'Owner Person',
};
/** A second business, deliberately empty, so the "no tags" condition is real
 *  rather than staged by deleting things. */
const PLAIN = {
  email: `plain-${stamp}@shop.test`,
  password: 'Dukaan2026x',
  name: 'Plain Owner',
};

/**
 * A book shaped so every condition below is reachable without faking one.
 *
 * `FULL` carries ten tags on purpose: it is the party the bulk dialog will skip
 * for BR-3's ceiling, which is the one path in this feature where a merchant is
 * told that something they asked for did not happen to everybody.
 */
const TAGS = {
  camp: { name: 'Camp Area', color: 'viz-1' },
  deccan: { name: 'Deccan', color: 'viz-3' },
  route: { name: 'Route 2', color: 'viz-5' },
  wholesale: { name: 'Wholesale', color: null },
  misspelt: { name: 'Camp aera', color: null },
};

const BOOK = [
  { name: 'Aarav Traders', is_customer: true, is_supplier: false, tags: ['Camp Area'] },
  { name: 'Bhavna Stores', is_customer: true, is_supplier: false, tags: ['Camp Area', 'Route 2'] },
  { name: 'Chetan Mart', is_customer: true, is_supplier: true, tags: ['Deccan'] },
  { name: 'Divya Agency', is_customer: true, is_supplier: true, tags: [] },
  { name: 'Esha & Sons', is_customer: true, is_supplier: false, tags: ['Wholesale', 'Deccan'] },
  {
    name: 'Farhan Supply',
    is_customer: true,
    is_supplier: false,
    tags: ['Camp Area', 'Deccan', 'Route 2', 'Wholesale', 'Camp aera'],
  },
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

async function makeOwner(who, tenantName, seedBook) {
  const registered = await post('/auth/register', {
    email: who.email,
    password: who.password,
    full_name: who.name,
  });
  await post(
    '/tenants',
    { name: tenantName, business_type: 'retail', state_code: '27' },
    registered.data.access_token,
    { 'Idempotency-Key': `tenant-${tenantName}-${stamp}` }
  );
  /* A SECOND sign-in: the register token was minted before the business
     existed, so it carries no tenant and every module-gated endpoint answers
     403 with it. */
  const scoped = await post('/auth/login', { email: who.email, password: who.password });
  const token = scoped.data.access_token;

  if (!seedBook) return token;

  for (const [key, tag] of Object.entries(TAGS)) {
    await post('/parties/tags', tag, token);
    void key;
  }
  const created = [];
  for (const [index, party] of BOOK.entries()) {
    const made = await post('/parties', party, token, {
      'Idempotency-Key': `party-${stamp}-${index}`,
    });
    created.push(made.data);
  }
  /* Farhan is pushed to the ceiling so the bulk dialog has somebody to skip.
     Five more on top of the five above makes ten — BR-3's limit exactly. */
  const farhan = created.find((party) => party.name === 'Farhan Supply');
  await api(
    'PATCH',
    `/parties/${farhan.id}`,
    { tags: [...BOOK[5].tags, 'Extra 1', 'Extra 2', 'Extra 3', 'Extra 4', 'Extra 5'] },
    token
  );
  return token;
}

/**
 * Sign in, and do not return until the app agrees that it worked.
 *
 * A fixed `waitForTimeout` after pressing Log in is enough most of the time and
 * not all of it, which is the worst kind of enough: the sweep then produces a
 * screenshot of the SIGN-IN SCREEN labelled "the party list", and nothing fails.
 * Waiting for the destination is the only condition that means what the step is
 * trying to assert.
 */
const signIn = async (page, who) => {
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
    await page.fill('input[type="email"], input[name="email"]', who.email);
    await page.fill('input[type="password"], input[name="password"]', who.password);
    await page.click('button[type="submit"]');
    // Wait for the sign-in to LAND (the URL leaves /login), not a fixed 2.5 s:
    // under a concurrent regression the password hash alone can outlast it,
    // and navigating away mid-request abandons the sign-in. `commit`, because
    // `load` is a state this app can legitimately never reach.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { waitUntil: 'commit', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(600);
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

// ── The sweep ───────────────────────────────────────────────────────────────

/**
 * Four widths, named for what a merchant is actually holding.
 *
 * 360x780 is the phone the product is designed for and the one the fold note in
 * CLAUDE.md is about. 768 is the md tier where the grid becomes a table and
 * drops columns. 1280 is the lg tier where selection and bulk actions appear at
 * all. 1440 is the desktop the tables were laid out against.
 */
const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
];

const shots = [];

const capture = async (page, size, name) => {
  if (!wantShots) return;
  const dir = `${SHOT_DIR}/${size.id}`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  shots.push(`${size.id}/${name}.png`);
};

const settle = (page, ms = 900) => page.waitForTimeout(ms);

/**
 * One capture attempt, isolated.
 *
 * A sweep exists to show what every screen looks like at every width, and a
 * control that is legitimately absent at one of them — the selection bar is a
 * `>= lg` affordance by design — must not cost the other fourteen pictures.
 * Failures are recorded and reported at the end rather than thrown.
 */
const missed = [];
const step = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    missed.push(`${label}: ${String(error).split('\n')[0]}`);
    /* A miss is evidence, so it leaves a picture behind. A sweep that only
       reports "timed out" sends somebody back to reproduce by hand what the
       browser had on screen at the time. */
    const dir = `${SHOT_DIR}/_failures`;
    mkdirSync(dir, { recursive: true });
    await lastPage?.screenshot({ path: `${dir}/${label.replace(/\s+/g, '-')}.png`, fullPage: true })
      .catch(() => undefined);
  }
};

/** The page a step was last working on, so a failure can be photographed. */
let lastPage = null;

/** Opens the party list and waits for the grid, whatever the tier. */
const openList = async (page, query = '') => {
  await page.goto(`${FRONTEND}/parties${query}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 30000 });
  await settle(page, 1200);
};

async function sweepTaggedBook(ctx, size) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: size.width, height: size.height });
  const at = (label, fn) => step(`${size.id} ${label}`, fn);

  // 1. The list, with chips on the rows.
  await at('list', async () => {
    await openList(page);
    await capture(page, size, '01-list-with-tag-chips');
  });

  // 2. Filtered to one tag, from the URL — the shareable form of the filter.
  await at('filtered', async () => {
    await openList(page, '?tag=Camp+Area');
    await capture(page, size, '02-list-filtered-by-tag');
  });

  // 3. A tag filter that matched nobody. The state that used to show the
  //    FIRST-USE empty state on a book full of parties.
  await at('filtered-empty', async () => {
    await openList(page, '?tag=Camp+Area&type=supplier');
    await capture(page, size, '03-list-tag-filter-empty');
  });

  // 4. The party form, with the Tags picker open on the create-inline row.
  await at('form', async () => {
    await openList(page);
    await page.getByRole('button', { name: /^Add party/i }).first().click();
    await settle(page, 900);
    await capture(page, size, '04-form-drawer-tags-field');
    await page.getByRole('combobox', { name: 'Tags' }).first().click();
    await settle(page, 600);
    await capture(page, size, '05-form-tag-picker-open');
    await page.getByPlaceholder('Search or type a new tag').first().fill('Festival');
    await settle(page, 500);
    await capture(page, size, '06-form-tag-create-inline');
    await page.keyboard.press('Escape');
    await settle(page, 400);
    await page.keyboard.press('Escape');
    await settle(page, 700);
  });

  // 5. The khata page, where every tag is shown rather than counted.
  await at('khata', async () => {
    await openList(page);
    /* The row's own open affordance, not the text: the name sits inside a table
       cell that intercepts the click, and the grid puts a real control on the
       first cell precisely so a row is openable at every tier. */
    await page.getByRole('button', { name: /Open Farhan Supply/i }).first().click();
    await settle(page, 1800);
    await capture(page, size, '07-khata-page-all-tags');
  });

  // 6. The selection bar and the bulk dialog — a >= lg affordance by design, so
  //    the narrow widths correctly have nothing to capture here.
  await at('bulk', async () => {
    await openList(page);
    const selectAll = page.getByRole('checkbox', { name: /Select all|Select every/i }).first();
    if ((await selectAll.count()) === 0) return;
    await selectAll.click();
    await settle(page, 600);
    await capture(page, size, '08-selection-bar');
    await page.getByRole('button', { name: 'Add tag' }).first().click();
    await settle(page, 800);
    await capture(page, size, '09-bulk-tag-dialog');
    await page.getByRole('combobox', { name: 'Tags' }).first().click();
    await settle(page, 500);
    await page.getByRole('option', { name: 'Route 2' }).first().click();
    await settle(page, 400);
    await page.keyboard.press('Escape');
    await settle(page, 400);
    await page.getByRole('radio', { name: /Replace them with these/i }).first().click();
    await settle(page, 400);
    await capture(page, size, '10-bulk-tag-replace-warning');
    await page.getByRole('radio', { name: /Keep them and add these/i }).first().click();
    await settle(page, 300);
    await page.getByRole('button', { name: 'Apply' }).first().click();
    await settle(page, 2000);
    await capture(page, size, '11-bulk-tag-report-with-skip');
  });

  // 7. The manager, and each of its overlays.
  //
  // Each overlay gets a FRESH PAGE, which is not belt-and-braces. Every step
  // deliberately leaves its dialog open so the screenshot has something in it,
  // and closing one reliably turned out to be the hard part: Escape is now
  // swallowed by the pickers inside these dialogs (correctly — see
  // `UbTokenInput`), and clicking Cancel still left Radix's focus guards in
  // place often enough that the NEXT step's button, plainly visible, timed out
  // on click. A new page has no leftovers by construction, and the context's
  // cookies carry the session, so it costs a navigation and nothing else.
  const onManager = async (name, fn) =>
    at(name, async () => {
      const own = await ctx.newPage();
      lastPage = own;
      await own.setViewportSize({ width: size.width, height: size.height });
      try {
        /* `domcontentloaded` and then the grid, rather than `networkidle`.
           The app keeps a connectivity probe running, so "no network activity
           for 500 ms" is a condition this product can legitimately never reach
           — and a 45-second navigation timeout on a page that rendered fine is
           a flake in the harness rather than a finding about the screen. */
        await own.goto(`${FRONTEND}/parties/tags`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await own.waitForSelector('[data-testid="ub-grid"]', { timeout: 45000 });
        await settle(own, 1400);
        await fn(own);
      } catch (error) {
        /* Photographed BEFORE the page is closed, which the outer handler
           cannot do — a sweep that only reports "timed out" sends somebody back
           to reproduce by hand what the browser had on screen at the time. */
        const dir = `${SHOT_DIR}/_failures`;
        mkdirSync(dir, { recursive: true });
        await own
          .screenshot({ path: `${dir}/${size.id}-${name}.png`, fullPage: true })
          .catch(() => undefined);
        throw error;
      } finally {
        await own.close();
      }
    });

  await onManager('manager', async (own) => {
    await capture(own, size, '12-tag-manager');
  });

  await onManager('tag-form', async (own) => {
    await own.getByRole('button', { name: 'New tag' }).first().click();
    await settle(own, 900);
    await capture(own, size, '13-tag-form-colour-picker');
  });

  await onManager('tag-rename', async (own) => {
    await own.getByRole('button', { name: 'Rename' }).first().click();
    await settle(own, 900);
    await capture(own, size, '14-tag-rename');
  });

  await onManager('tag-merge', async (own) => {
    await own.getByRole('button', { name: /^Merge into/ }).first().click();
    await settle(own, 900);
    await own.getByRole('combobox', { name: 'Keep this tag' }).first().click();
    await settle(own, 600);
    /* Scoped to the popover's LISTBOX. A bare `getByRole('option')` also matches
       the `<option>` elements inside the paging bar's native page-size select,
       which are in the DOM and not clickable — a selector that fails for a
       reason that has nothing to do with the thing under test. */
    await own.getByRole('listbox').getByRole('option').first().click();
    await settle(own, 800);
    await capture(own, size, '15-tag-merge-consequence');
  });

  await onManager('tag-delete', async (own) => {
    await own.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await settle(own, 1600);
    await capture(own, size, '16-tag-delete-confirm');
  });

  await page.close();
}

/** The book that has never made a tag — the state most tenants are in. */
async function sweepPlainBook(browser, size) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await ctx.newPage();
  await signIn(page, PLAIN);
  await openList(page);
  await capture(page, size, '17-list-no-tags-anywhere');
  await page.goto(`${FRONTEND}/parties/tags`, { waitUntil: 'networkidle', timeout: 45000 });
  await settle(page, 1500);
  await capture(page, size, '18-tag-manager-empty');
  await ctx.close();
}

/** Dark mode, at one width, because the question it answers is about tokens
 *  rather than layout: do the eight palette colours survive a theme change. */
async function sweepDark(browser, size) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  await ctx.addCookies([
    { name: 'ub_theme_choice', value: 'dark', url: FRONTEND },
  ]);
  const page = await ctx.newPage();
  await signIn(page, OWNER);
  await openList(page);
  await capture(page, size, '19-list-dark');
  await page.goto(`${FRONTEND}/parties/tags`, { waitUntil: 'networkidle', timeout: 45000 });
  await settle(page, 1500);
  await capture(page, size, '20-tag-manager-dark');
  await ctx.close();
}

// ── The checks ──────────────────────────────────────────────────────────────

async function checks(browser, token) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const listRequests = [];
  page.on('request', (r) => {
    const url = r.url();
    /* `+` is a space in a query string and `decodeURIComponent` does not decode
       it, so the raw URL is normalised here rather than in the assertions. */
    /* The API's list request, not the PAGE's own address — now that the filters
       live in the URL, `/parties?tag=…` matches both and the page navigation has
       no `/api/v1` to split on. */
    if (!url.includes('/api/v1/parties?')) return;
    const path = url.split('/api/v1')[1];
    /* `+` is a space in a query string and `decodeURIComponent` does not decode
       it, so it is normalised here rather than in each assertion. */
    listRequests.push(decodeURIComponent(path.replace(/\+/g, '%20')));
  });

  await signIn(page, OWNER);
  await openList(page);

  // 1. The chips are on the rows, from the list response.
  {
    const rowText = await page.locator('[data-testid="ub-grid"]').innerText();
    record(
      'the list response already carries the tags, so the rows show them',
      rowText.includes('Camp Area') && rowText.includes('Deccan'),
      rowText.split('\n').slice(0, 6).join(' | ')
    );
  }

  // 2. The filter reaches the wire with the NAME intact.
  {
    const before = listRequests.length;
    await page.getByRole('combobox', { name: 'Tag' }).first().click();
    await settle(page, 500);
    await page.getByRole('option', { name: 'Camp Area' }).first().click();
    await settle(page, 1500);
    const issued = listRequests.slice(before);
    record(
      'choosing a tag issues a request carrying tag=Camp Area',
      issued.some((url) => url.includes('tag=Camp Area')),
      issued.join(' | ') || '(no request issued)'
    );

    const grid = await page.locator('[data-testid="ub-grid"]').innerText();
    record(
      'and the list narrows to the three parties that carry it',
      grid.includes('Aarav Traders') &&
        grid.includes('Bhavna Stores') &&
        !grid.includes('Chetan Mart'),
      grid.split('\n').slice(0, 8).join(' | ')
    );

    const stats = await page.locator('[data-testid="ub-stat-grid"]').innerText();
    record(
      'and the header totals describe the filtered set, not the whole book',
      stats.includes('Across everyone in this list'),
      stats.replace(/\n/g, ' | ')
    );
  }

  // 3. A filter carried in the URL is APPLIED, and counts as a filter.
  {
    await openList(page, '?tag=Camp+Area&type=supplier');
    const body = await page.locator('[data-testid="ub-grid"]').innerText();
    record(
      'a tag filter carried in the URL actually filters the list',
      !body.includes('Aarav Traders') && !body.includes('Bhavna Stores'),
      body.split('\n').slice(0, 6).join(' | ')
    );
    record(
      'and the empty result is the FILTERED state, not the first-use one',
      !body.includes('Add the first person you give udhaar to'),
      body.split('\n').slice(0, 6).join(' | ')
    );
    record(
      'and there is a way back out of it',
      (await page.getByRole('button', { name: /Clear filters/i }).count()) > 0,
      ''
    );
    record(
      'and the chip shows what is applied',
      (await page.getByRole('button', { name: 'Remove tag Camp Area' }).count()) > 0,
      ''
    );
  }

  // 4. A tag created inline on the party form really exists afterwards.
  {
    const beforeTags = (await get('/parties/tags', token)).data.length;
    await openList(page);
    await page.getByRole('button', { name: /^Add (customer|party)/i }).first().click();
    await settle(page, 900);
    await page.getByRole('textbox', { name: /^Name/i }).first().fill('Inline Tag Test');
    await page.getByRole('combobox', { name: 'Tags' }).first().click();
    await settle(page, 400);
    await page.getByPlaceholder('Search or type a new tag').first().fill('Festival Stall');
    await settle(page, 500);
    await page.getByText('Create “Festival Stall”').first().click();
    await settle(page, 400);
    /* Escape closes the PICKER, not the drawer — Radix's popover takes the key
       before the drawer sees it. That is worth relying on here rather than
       clicking elsewhere to dismiss, because a stray click on this form is how
       the drawer's own dismiss-on-backdrop guard gets exercised by accident. */
    await page.keyboard.press('Escape');
    await settle(page, 500);
    record(
      'Escape closes the tag picker without taking the half-filled form with it',
      (await page.getByRole('button', { name: 'Save party' }).count()) > 0,
      ''
    );
    await page.getByRole('button', { name: 'Save party' }).first().click();
    await settle(page, 2500);

    const after = (await get('/parties/tags', token)).data;
    record(
      'a tag created inline on the party form exists on the server afterwards',
      after.length === beforeTags + 1 && after.some((t) => t.name === 'Festival Stall'),
      `${beforeTags} -> ${after.length}`
    );
  }

  // 5. A rename in the manager changes the chip on the list — the whole of US-4.
  {
    const tags = (await get('/parties/tags', token)).data;
    const misspelt = tags.find((t) => t.name === 'Camp aera');
    record('the misspelt tag is there to rename', Boolean(misspelt), misspelt?.name ?? '(missing)');

    await api('PATCH', `/parties/tags/${misspelt.id}`, { name: 'Camp Aera Fixed' }, token);
    /* Filtered TO the renamed tag, because Farhan carries ten tags and a list
       row shows two before the rest become "+8" — an earlier version of this
       check looked at the row text, found the new name in the overflow it
       cannot see, and failed for a feature that works. Filtering also proves
       the rename reached the index the filter uses, which is the half of US-4
       that a chip cannot show. */
    await openList(page, '?tag=Camp+Aera+Fixed');
    const grid = await page.locator('[data-testid="ub-grid"]').innerText();
    record(
      'renaming a tag changes it on every party at once, with no per-party edit',
      grid.includes('Farhan Supply'),
      grid.split('\n').slice(0, 8).join(' | ')
    );
  }

  // 6. Deleting a tag keeps every party (BR-5).
  {
    const tags = (await get('/parties/tags', token)).data;
    const doomed = tags.find((t) => t.name === 'Camp Aera Fixed');
    const before = (await get('/parties?page_size=100', token)).meta.total;
    await api('DELETE', `/parties/tags/${doomed.id}`, null, token);
    const after = (await get('/parties?page_size=100', token)).meta.total;
    record(
      'deleting a tag removes the label and keeps every party (BR-5)',
      before === after && before > 0,
      `${before} parties before, ${after} after`
    );
  }

  await ctx.close();
}

async function run() {
  const token = await makeOwner(OWNER, 'Kumar Stores', true);
  await makeOwner(PLAIN, 'Plain Stores', false);
  /* The plain book still needs parties, or the "no tags" screenshot is an empty
     list rather than a list without a chip lane — two different pictures, and
     the one worth looking at is the second. */
  const plainToken = (await post('/auth/login', { email: PLAIN.email, password: PLAIN.password }))
    .data.access_token;
  for (const [index, party] of BOOK.entries()) {
    await post(
      '/parties',
      { name: party.name, is_customer: party.is_customer, is_supplier: party.is_supplier },
      plainToken,
      { 'Idempotency-Key': `plain-party-${stamp}-${index}` }
    );
  }

  const browser = await chromium.launch();

  await checks(browser, token);

  if (wantShots) {
    for (const size of SIZES) {
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
      });
      const page = await ctx.newPage();
      await signIn(page, OWNER);
      await page.close();
      await sweepTaggedBook(ctx, size);
      await ctx.close();
      await sweepPlainBook(browser, size);
    }
    await sweepDark(browser, SIZES[3]);
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
