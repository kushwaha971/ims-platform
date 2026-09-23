#!/usr/bin/env node
/**
 * e2e/ledger.mjs — LED-01's entries, against a real browser and a real server,
 * plus the screenshot sweep that goes with it.
 *
 * ── What only a live stack can answer ──────────────────────────────────────
 *
 *   1. The entry reaches the WIRE. `e2e/parties.mjs` exists because a chip that
 *      lights up is not a chip that filters, and `e2e/tags.mjs` because a form
 *      that validates is not a form that sends — the party form's tag chips
 *      rendered, validated and saved with a 201 for a week while `toWireBody`
 *      dropped every one of them. This is the same class of defect on the most
 *      consequential write in the product.
 *   2. The BALANCE moves, on the header, in the list and in the database, by the
 *      amount the merchant typed. Three surfaces, one number; a unit test can
 *      only ever assert one of them at a time against a mock.
 *   3. The idempotency key survives a retry. That is a property of the HEADER
 *      the axios instance sends, not of anything a component holds, and the
 *      failure it prevents — two entries for one sale — is the most damaging
 *      bug this feature could have.
 *   4. The credit limit refuses inside the transaction that writes. PTY-06
 *      could only describe the rule; this is the first write it can stop.
 *   5. The timeline pages without losing the rows that tie on a date. The
 *      cursor bug this found was invisible to every component test, because
 *      they hand the client its pages by hand.
 *
 * ── What is deliberately NOT here ──────────────────────────────────────────
 * The photo attachment and the transaction SMS. The `files` app has no table
 * and LED-08 owns the templates, so both are deferrals with named owners rather
 * than gaps — see `apps/ledger/services/entries.py`.
 *
 *   ./e2e/serve-api.sh && ./e2e/serve.sh
 *   node e2e/ledger.mjs
 *   node e2e/ledger.mjs --shots
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
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots/ledger';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

const stamp = Date.now();
const OWNER = { email: `ledger-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };
const STAFF = { email: `ledger-staff-${stamp}@shop.test`, password: 'Dukaan2026x' };

/**
 * A book shaped so every condition is reachable without a second run.
 *
 * Unlike `credit.mjs`, NO BALANCE IS SET THROUGH THE ORM. Every figure below is
 * reached by posting entries through the API, because LED-01 is what made that
 * possible — and a fixture that still reached past the product would be testing
 * a state the product cannot produce.
 */
const BOOK = [
  { key: 'plain', name: 'Aarav Traders', limit: null },
  { key: 'near', name: 'Bhavna Stores', limit: '50000.00' },
  { key: 'busy', name: 'Chetan Mart', limit: null },
  { key: 'empty', name: 'Divya Agency', limit: null },
  { key: 'advance', name: 'Esha & Sons', limit: null },
  // LED-02. `fresh` has no opening and is what the drawer is opened on;
  // `migrated` was created WITH one, which is the party-create path (FR-2).
  { key: 'fresh', name: 'Farhan Supply', limit: null },
  { key: 'supplier', name: 'Gita Wholesale', limit: null, supplierOnly: true },
  // LED-03. `fix` is what the reverse and correct checks act on, and it has its
  // own party for the reason `fresh` does: a check that undoes an entry changes
  // the state every later check reads, and sharing `plain` would make the order
  // of the checks part of their meaning.
  { key: 'fix', name: 'Imran Hardware', limit: null },
];

/** Declared above `seed()`, which mints one un-opened party per size. */
const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
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
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body: payload, headers: response.headers };
};

const must = async (...args) => {
  const response = await api(...args);
  if (response.status >= 400) {
    throw new Error(`${args[0]} ${args[1]} ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The tenant's credit mode, through the ORM.
 *
 * `warn` is the seeded default and there is no endpoint that changes it yet —
 * PLT-06 owns the settings screen. The harness reaches past the product for
 * exactly one value, and says so, rather than leaving `block` untested until
 * that screen exists.
 *
 * The tenant is found through a PARTY rather than by name. Every run of this
 * harness creates another "Kumar Stores", so a lookup by name found twenty of
 * them on the second afternoon — and the one it wanted was whichever the
 * database happened to return.
 */
const setCreditMode = async (mode, partyId) => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(
    'python',
    [
      'manage.py',
      'shell',
      '-c',
      'from apps.parties.models import Party\n' +
        'from apps.platform_app.models import TenantSetting\n' +
        `t = Party.objects.get(pk='${partyId}').tenant\n` +
        'TenantSetting.objects.update_or_create(tenant=t, ' +
        "key='ledger.credit_limit_mode', defaults={'value': {'mode': '" + mode + "'}})",
    ],
    {
      cwd: '/home/claude/repo/backend',
      env: { ...process.env, DJANGO_SETTINGS_MODULE: 'config.settings.local' },
    }
  );
};
/**
 * A staff account in the owner's tenant, signed in, for BR-8.
 *
 * Created through `POST /members`, which is the product's own path (DEC-012):
 * the server mints a temporary password and returns it ONCE, because nothing is
 * emailed and the owner sends it by hand. The first sign-in is therefore a
 * forced password change, which this walks through with the API rather than the
 * browser — the screen is `credentials.mjs`'s to test, and what this harness
 * needs is a token and a session that can open a khata.
 */
const staffSession = async (token) => {
  const made = await must(
    'POST',
    '/members',
    { email: STAFF.email, full_name: 'Counter Person', role: 'staff' },
    token,
    { 'Idempotency-Key': `staff-${stamp}` }
  );
  const issued = made.body.data.password;
  const first = await must('POST', '/auth/login', { email: STAFF.email, password: issued });
  await must(
    'POST',
    '/auth/password/set',
    { current_password: issued, new_password: STAFF.password },
    first.body.data.access_token
  );
  const scoped = await must('POST', '/auth/login', {
    email: STAFF.email,
    password: STAFF.password,
  });
  return scoped.body.data.access_token;
};

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const postEntry = (partyId, body, token, key) =>
  api('POST', `/parties/${partyId}/ledger-entries`, { entry_date: today(), ...body }, token, {
    'Idempotency-Key': key ?? `e2e-${stamp}-${Math.random()}`,
  });

async function seed() {
  const registered = await must('POST', '/auth/register', {
    email: OWNER.email,
    password: OWNER.password,
    full_name: OWNER.name,
  });
  await must(
    'POST',
    '/tenants',
    { name: 'Kumar Stores', business_type: 'retail', state_code: '27' },
    registered.body.data.access_token,
    { 'Idempotency-Key': `tenant-${stamp}` }
  );
  const scoped = await must('POST', '/auth/login', {
    email: OWNER.email,
    password: OWNER.password,
  });
  const token = scoped.body.data.access_token;

  const parties = {};
  for (const [index, party] of BOOK.entries()) {
    const made = await must(
      'POST',
      '/parties',
      {
        name: party.name,
        is_customer: !party.supplierOnly,
        is_supplier: Boolean(party.supplierOnly),
        ...(party.limit ? { credit_limit: party.limit, credit_days: 30 } : {}),
      },
      token,
      { 'Idempotency-Key': `party-${stamp}-${index}` }
    );
    parties[party.key] = { ...party, id: made.body.data.id };
  }

  // Every balance below is reached by POSTING, which is the point.
  await postEntry(parties.plain.id, { direction: 'debit', amount: '2300.00', note: 'Sugar 10 kg' }, token);
  await postEntry(parties.near.id, { direction: 'debit', amount: '40000.00' }, token);
  await postEntry(
    parties.advance.id,
    { direction: 'credit', amount: '2000.00', payment_mode: 'upi', reference: 'UTR-ADV' },
    token
  );
  // A busy Saturday: twelve entries on ONE date, which is what the keyset
  // cursor gets wrong if it builds an AND of terms instead of a tuple compare.
  for (let index = 0; index < 12; index += 1) {
    await postEntry(
      parties.busy.id,
      { direction: 'debit', amount: `${index + 1}00.00`, entry_date: daysAgo(1) },
      token
    );
  }
  // And one backdated line on the same party, for the tag.
  await postEntry(
    parties.busy.id,
    { direction: 'credit', amount: '500.00', payment_mode: 'cash', entry_date: daysAgo(20) },
    token
  );

  // LED-02 FR-2 — a party created WITH an opening, through the party endpoint.
  const migrated = await must(
    'POST',
    '/parties',
    {
      name: 'Hema Provisions',
      is_customer: true,
      opening_balance_amount: '2300.00',
      opening_balance_direction: 'debit',
      opening_balance_as_of: '2026-04-01',
    },
    token,
    { 'Idempotency-Key': `migrated-${stamp}` }
  );
  parties.migrated = { key: 'migrated', name: 'Hema Provisions', id: migrated.body.data.id };

  /* LED-03's two entries on `fix`: one to reverse, one to correct.
 
     Both posted rather than seeded, like everything else here, and on
     DIFFERENT dates so the timeline's day headers separate them — a reversal
     carries the ORIGINAL's date (BR-7), so a pair posted on one date and shown
     with corrections on reads as four rows under one header, which is a
     harder screenshot to read than it needs to be. */
  await postEntry(
    parties.fix.id,
    { direction: 'debit', amount: '500.00', note: 'Cement bags', entry_date: daysAgo(2) },
    token
  );
  await postEntry(
    parties.fix.id,
    { direction: 'debit', amount: '800.00', note: 'Sand load', entry_date: daysAgo(1) },
    token
  );

  /* One un-opened party PER SIZE, for the sweep.
 
     The checks run first and give `fresh` an opening balance, so by the time
     the sweep reaches it the "Add opening balance" action is gone — which is
     the product working and the harness asking the wrong party. The first run
     of this reported eight captures that did not happen rather than eight
     pictures of a khata with no action on it, which is the step failing loudly
     instead of photographing the wrong state.
 
     Per size rather than one shared party, because the four size runs post an
     opening each and the second would find the first's. */
  for (const size of SIZES) {
    const made = await must(
      'POST',
      '/parties',
      { name: `Sweep ${size.id}`, is_customer: true },
      token,
      { 'Idempotency-Key': `sweep-${stamp}-${size.id}` }
    );
    parties[`sweep_${size.id}`] = { key: `sweep_${size.id}`, name: `Sweep ${size.id}`, id: made.body.data.id };
  }

  /* And one UNCORRECTED party per size, for the same reason again.
 
     The LED-03 checks reverse one entry on `fix` and correct the other, so by
     the time the sweep runs, `fix` has no standing manual entry left in the
     state the shots want — the ⋯ still opens, but the timeline behind it is
     already three rows of history rather than the clean book the "before"
     picture is supposed to show. Per size because each size run corrects one. */
  for (const size of SIZES) {
    const made = await must(
      'POST',
      '/parties',
      { name: `Fix ${size.id}`, is_customer: true },
      token,
      { 'Idempotency-Key': `fix-${stamp}-${size.id}` }
    );
    const id = made.body.data.id;
    parties[`fix_${size.id}`] = { key: `fix_${size.id}`, name: `Fix ${size.id}`, id };
    await postEntry(
      id,
      { direction: 'debit', amount: '500.00', note: 'Cement bags', entry_date: daysAgo(2) },
      token
    );
    await postEntry(
      id,
      { direction: 'credit', amount: '200.00', payment_mode: 'cash', entry_date: daysAgo(1) },
      token
    );
  }

  return { token, parties };
}

// ── The browser ─────────────────────────────────────────────────────────────

const settle = (page, ms = 900) => page.waitForTimeout(ms);

const signIn = async (page, who = OWNER) => {
  for (const attempt of [1, 2]) {
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.fill('input[type="email"], input[name="email"]', who.email);
    await page.fill('input[type="password"], input[name="password"]', who.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try {
      await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 20000 });
      await page.waitForTimeout(600);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
};

const openKhata = async (page, party) => {
  await page.goto(`${FRONTEND}/parties/${party.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForSelector('text=Transactions', { timeout: 45000 });
  await settle(page, 1200);
};

const openDrawer = async (page, which) => {
  await page.getByRole('button', { name: which }).first().click();
  await page.waitForSelector('role=dialog', { timeout: 15000 });
  await settle(page, 700);
};

/**
 * Open the khata header's overflow menu.
 *
 * Edit, Add opening balance and Archive moved behind it when the action row
 * reached five buttons and ran 275 px off the right edge of a 360 px phone.
 * The harness opens it the way a merchant does, rather than reaching past it.
 */
const openHeaderMenu = async (page) => {
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await settle(page, 600);
};

const fillAmount = async (page, amount) => {
  const field = page.getByLabel('Amount');
  await field.fill(amount);
  await field.blur();
  await settle(page, 300);
};

// ── The sweep ───────────────────────────────────────────────────────────────

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

  await signIn(page);

  /* Nothing on this page may be wider than the screen it is on.
 
     A generic assertion rather than one about a particular control, because the
     defect it caught was generic: LED-01 put two buttons in the khata header's
     action row and LED-02 added a fifth, and on a 360 px phone the row ran off
     the right edge — the two rightmost actions painted outside the viewport,
     with the page horizontally scrollable to reach them. Every unit test
     passed; `getByRole` finds a button whether or not it is on the screen.
 
     Checked at every size, on the two pages with the most chrome. */
  await at('00-no-horizontal-overflow', async () => {
    for (const party of [parties.plain, parties[`sweep_${size.id}`]]) {
      await openKhata(page, party);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 1) {
        throw new Error(
          `${size.id}: the khata page is ${overflow}px wider than the screen`
        );
      }
    }
  });

  /* Nothing on this page is clipped mid-word.
 
     Measured rather than read: `innerText` returns the full string whatever the
     pixels do, which is exactly how LED-01's duplicated "You gave" survived
     every unit test and how the opening row came to read "Opening…" beside a
     badge that repeats the word it cut off.
 
     `sr-only` is excluded, because clipping is what it IS — a 1px box holding
     text for a screen reader. Everything else that overflows its own box is a
     word a merchant cannot finish reading. */
  await at('00-nothing-clipped', async () => {
    for (const party of [parties.migrated, parties.plain, parties.busy]) {
      await openKhata(page, party);
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll('p, span, div, h1, h2, h3'))
          .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
          .filter((node) => !node.className.toString().includes('sr-only'))
          .filter((node) => node.scrollWidth - node.clientWidth > 1)
          .map((node) => (node.textContent ?? '').trim())
          .slice(0, 6)
      );
      if (clipped.length > 0) {
        throw new Error(`${size.id}: clipped — ${clipped.join(' | ')}`);
      }
    }
  });

  await at('01-khata-with-entries', async () => {
    await openKhata(page, parties.plain);
    await capture(page, size, '01-khata-with-entries');
  });

  await at('02-khata-empty', async () => {
    await openKhata(page, parties.empty);
    await capture(page, size, '02-khata-empty');
  });

  await at('03-khata-many-days', async () => {
    await openKhata(page, parties.busy);
    await capture(page, size, '03-khata-many-days');
  });

  await at('04-khata-advance', async () => {
    await openKhata(page, parties.advance);
    await capture(page, size, '04-khata-advance');
  });

  await at('05-drawer-you-gave', async () => {
    await openKhata(page, parties.plain);
    await openDrawer(page, /You gave/);
    await capture(page, size, '05-drawer-you-gave');
  });

  await at('06-drawer-you-got', async () => {
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await openDrawer(page, /You got/);
    await capture(page, size, '06-drawer-you-got');
  });

  await at('07-drawer-filled', async () => {
    await fillAmount(page, '750');
    await page.getByLabel(/^Note/).fill('Part payment for last week');
    await settle(page, 400);
    await capture(page, size, '07-drawer-filled');
  });

  await at('08-drawer-validation', async () => {
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await openDrawer(page, /You gave/);
    await page.getByRole('button', { name: 'Save' }).click();
    await settle(page, 900);
    await capture(page, size, '08-drawer-validation');
  });

  await at('09-drawer-over-limit', async () => {
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await openKhata(page, parties.near);
    await openDrawer(page, /You gave/);
    await fillAmount(page, '20000');
    await page.getByRole('button', { name: 'Save' }).click();
    /* Scroll the BANNER into view before photographing it, and fail the step if
       it is not there. `credit.mjs` learned this the hard way: the drawer has
       its own scroll container, so `fullPage: true` photographs the page behind
       it at whatever offset the drawer happens to hold, and the image captioned
       "over limit" did not contain the banner. */
    const banner = page.getByText('This goes past their credit limit');
    await banner.waitFor({ state: 'visible', timeout: 10000 });
    await banner.scrollIntoViewIfNeeded();
    await settle(page, 500);
    await capture(page, size, '09-drawer-over-limit');
  });

  await at('11-khata-with-opening', async () => {
    await openKhata(page, parties.migrated);
    await capture(page, size, '11-khata-with-opening');
  });

  await at('12-opening-drawer', async () => {
    await openKhata(page, parties[`sweep_${size.id}`]);
    await openHeaderMenu(page);
    const action = page.getByRole('button', { name: 'Add opening balance' });
    await action.first().waitFor({ state: 'visible', timeout: 10000 });
    await action.first().click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await settle(page, 700);
    await capture(page, size, '12-opening-drawer');
  });

  await at('13-opening-drawer-filled', async () => {
    const amount = page.getByLabel('Amount');
    await amount.fill('4500');
    await amount.blur();
    /* Scroll the direction HINT into view before photographing it, and fail the
       step if it is not there. It is the one sentence that lets a merchant check
       they understood the question, and a picture captioned "filled" that does
       not contain it says nothing — the lesson `credit.mjs` and LED-01's own
       sweep both had to learn. */
    const hint = page.getByText(/You will (get|give) ₹/).first();
    await hint.waitFor({ state: 'visible', timeout: 10000 });
    await hint.scrollIntoViewIfNeeded();
    await settle(page, 400);
    await capture(page, size, '13-opening-drawer-filled');
    await page.keyboard.press('Escape');
    await settle(page, 500);
  });

  await at('10-khata-after-saving', async () => {
    await page.keyboard.press('Escape');
    await settle(page, 600);
    await openKhata(page, parties.plain);
    await openDrawer(page, /You gave/);
    await fillAmount(page, '450');
    await page.getByLabel(/^Note/).fill(`Swept at ${size.width}px`);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForSelector(`text=Swept at ${size.width}px`, { timeout: 15000 });
    await settle(page, 900);
    await capture(page, size, '10-khata-after-saving');
  });

  // ── LED-03 ───────────────────────────────────────────────────────────────
  //
  // Six conditions, on this size's OWN uncorrected party. The checks above
  // reversed one entry on `fix` and corrected the other, so `fix` no longer has
  // the clean book these pictures are supposed to start from.

  await at('14-row-menu', async () => {
    await openKhata(page, parties[`fix_${size.id}`]);
    const menu = page.getByRole('button', { name: 'More actions for Cement bags' });
    await menu.first().waitFor({ state: 'visible', timeout: 10000 });
    await menu.first().click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await settle(page, 700);
    await capture(page, size, '14-row-menu');
  });

  await at('15-reverse-dialog', async () => {
    await page.getByRole('button', { name: 'Reverse this entry' }).click();
    /* Wait for the RESTATED ROW, not just for the dialog. The whole argument
       for showing the entry again is that the ⋯ covered it and the list has
       scrolled — a picture captioned "reverse" that does not contain "Cement
       bags" and "₹500.00" would prove nothing about that. */
    const restated = page.getByText('Cement bags').first();
    await restated.waitFor({ state: 'visible', timeout: 10000 });
    await restated.scrollIntoViewIfNeeded();
    await settle(page, 600);
    await capture(page, size, '15-reverse-dialog');
  });

  await at('16-reverse-validation', async () => {
    // §10's refusal, in place: the reason is the feature and it cannot be
    // skipped. This is the picture that shows a merchant what they will see.
    await page.getByRole('button', { name: 'Reverse entry' }).click();
    const error = page.getByText(/Give a short reason/).first();
    await error.waitFor({ state: 'visible', timeout: 10000 });
    await error.scrollIntoViewIfNeeded();
    await settle(page, 500);
    await capture(page, size, '16-reverse-validation');
    await page.keyboard.press('Escape');
    await settle(page, 600);
  });

  await at('17-correction-drawer', async () => {
    await openKhata(page, parties[`fix_${size.id}`]);
    await page.getByRole('button', { name: 'More actions for Cement bags' }).first().click();
    await settle(page, 600);
    await page.getByRole('button', { name: 'Correct this entry' }).click();
    /* Wait for the EXPLANATION, which is the one sentence in this product that
       says why its ledger works the way it does — a merchant who thinks this
       edits the line in place will otherwise be surprised by three rows. */
    const explain = page.getByText(/original stays in the book/).first();
    await explain.waitFor({ state: 'visible', timeout: 10000 });
    await settle(page, 700);
    await capture(page, size, '17-correction-drawer');
  });

  await at('18-correction-filled', async () => {
    await fillAmount(page, '550');
    const reason = page.getByLabel('Reason');
    await reason.fill('Recounted the bags');
    await reason.blur();
    await reason.scrollIntoViewIfNeeded();
    await settle(page, 500);
    await capture(page, size, '18-correction-filled');
  });

  await at('19-khata-after-correcting', async () => {
    await page.getByRole('button', { name: 'Save correction' }).click();
    await page.waitForSelector('text=₹550.00', { timeout: 15000 });
    await settle(page, 900);
    await capture(page, size, '19-khata-after-correcting');
  });

  await at('20-khata-showing-corrections', async () => {
    /* The raw history: the mistake struck through, the reversal that undid it,
       and the replacement standing. This is the densest row this timeline ever
       draws — three badges and three amounts under one date header — which is
       why it is photographed at every width rather than described. */
    await page.getByRole('switch', { name: 'Show corrections' }).click();
    const badge = page.getByText('Corrected').first();
    await badge.waitFor({ state: 'visible', timeout: 15000 });
    await settle(page, 900);
    await capture(page, size, '20-khata-showing-corrections');

    // And the width rules again, on the state that has the most in a row.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) {
      throw new Error(`${size.id}: the corrected khata is ${overflow}px wider than the screen`);
    }
    const clipped = await page.evaluate(() =>
      Array.from(document.querySelectorAll('p, span, div, h1, h2, h3'))
        .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim())
        .filter((node) => !node.className.toString().includes('sr-only'))
        .filter((node) => node.scrollWidth - node.clientWidth > 1)
        .map((node) => (node.textContent ?? '').trim())
        .slice(0, 6)
    );
    if (clipped.length > 0) {
      throw new Error(`${size.id}: clipped on the corrected khata — ${clipped.join(' | ')}`);
    }
  });

  await page.close();
}

// ── The checks ──────────────────────────────────────────────────────────────

async function checks(browser, token, parties) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const posts = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('/ledger-entries')) return;
    posts.push({
      url: request.url(),
      body: request.postData(),
      key: request.headers()['idempotency-key'] ?? null,
    });
  });

  await signIn(page);

  // 1. The khata renders what the server posted, in the merchant's own words.
  {
    await openKhata(page, parties.plain);
    const body = await page.locator('body').innerText();
    record(
      'the khata shows the entry that was posted, with its note',
      body.includes('Sugar 10 kg') && body.includes('₹2,300.00'),
      body.split('\n').filter((line) => line.includes('Sugar')).join(' | ') || '(not on screen)'
    );
    record(
      'and the header agrees with it',
      body.includes('You will get'),
      ''
    );
  }

  // 2. The write reaches the wire — the defect `tags.mjs` exists for.
  {
    const before = posts.length;
    await openDrawer(page, /You gave/);
    await fillAmount(page, '500');
    await page.getByLabel(/^Note/).fill('Rice 5 kg');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForSelector('text=Rice 5 kg', { timeout: 15000 });
    const issued = posts.slice(before);
    const sent = issued[0] ? JSON.parse(issued[0].body) : {};
    record(
      'saving issues a POST carrying what the merchant typed',
      sent.amount === '500.00' && sent.note === 'Rice 5 kg' && sent.direction === 'debit',
      JSON.stringify(sent)
    );
    record(
      'and it carries an Idempotency-Key header',
      Boolean(issued[0]?.key),
      issued[0]?.key ?? '(no key)'
    );
  }

  // 3. The balance moves on the header without a reload (FR-3).
  {
    await settle(page, 1200);
    const body = await page.locator('body').innerText();
    record(
      'the header balance moves to the number this entry produced',
      body.includes('₹2,800.00'),
      body.split('\n').filter((line) => line.includes('₹2,8')).join(' | ') || '(unchanged)'
    );
  }

  // 4. And in the database, which is the only one that matters tomorrow.
  {
    const detail = await api('GET', `/parties/${parties.plain.id}`, null, token);
    record(
      'and the server agrees',
      detail.body?.data?.summary?.balance === '2800.00',
      detail.body?.data?.summary?.balance ?? '(no summary)'
    );
  }

  // 5. A credit reduces it, and carries how the money arrived.
  {
    await openDrawer(page, /You got/);
    await fillAmount(page, '300');
    await page.getByRole('button', { name: 'Save' }).click();
    await settle(page, 2000);
    const detail = await api('GET', `/parties/${parties.plain.id}`, null, token);
    record(
      'money coming back reduces what they owe',
      detail.body?.data?.summary?.balance === '2500.00',
      detail.body?.data?.summary?.balance ?? '(no summary)'
    );
  }

  // 6. The list the merchant goes back to says the same thing.
  {
    await page.goto(`${FRONTEND}/parties`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-testid="ub-grid"]', { timeout: 45000 });
    await settle(page, 1500);
    const grid = await page.locator('[data-testid="ub-grid"]').innerText();
    record(
      'the list refetches rather than showing the balance from before the entry',
      grid.includes('₹2,500.00'),
      grid.split('\n').filter((line) => line.includes('Aarav')).join(' | ')
    );
  }

  // 7. The timeline pages without losing the rows that tie on a date.
  {
    await openKhata(page, parties.busy);
    let guard = 0;
    while ((await page.getByRole('button', { name: 'Show older entries' }).count()) > 0) {
      await page.getByRole('button', { name: 'Show older entries' }).click();
      await settle(page, 1200);
      guard += 1;
      if (guard > 6) break;
    }
    const body = await page.locator('body').innerText();
    const amounts = ['100.00', '600.00', '1,200.00'].map((amount) => body.includes(`₹${amount}`));
    record(
      'a busy Saturday pages through without dropping the rows that tie on a date',
      amounts.every(Boolean),
      `first ${amounts[0]}, middle ${amounts[1]}, last ${amounts[2]}`
    );
    record(
      'and the backdated line is marked as one',
      body.includes('Backdated'),
      body.includes('Backdated') ? '' : '(no tag)'
    );
  }

  // 8. Warn mode, which is the DEFAULT, posts and says what it means.
  //
  // The harness assumed `block` and found `warn` — which is the product being
  // right and the test being wrong. `warn` is the default because a merchant
  // who has not thought about credit limits should be TOLD, not stopped: a rule
  // nobody chose should never cost somebody a sale.
  {
    await openKhata(page, parties.near);
    await openDrawer(page, /You gave/);
    await fillAmount(page, '15000');
    await page.getByRole('button', { name: 'Save' }).click();
    await settle(page, 2500);
    const body = await page.locator('body').innerText();
    record(
      'in warn mode the entry SAVES and the merchant is told how far over',
      body.includes('over the') && body.includes('₹50,000.00'),
      body.split('\n').filter((line) => line.includes('over the')).join(' | ') || '(no notice)'
    );
    record(
      'and the figures in that notice are grouped, with one rupee symbol',
      !body.includes('₹₹') && !/₹\d{5,}\./.test(body),
      body.split('\n').filter((line) => line.includes('over the')).join(' | ')
    );
  }

  // 9. Block mode refuses inside the transaction that writes.
  {
    await setCreditMode('block', parties.near.id);
    await openKhata(page, parties.near);
    await openDrawer(page, /You gave/);
    await fillAmount(page, '20000');
    await page.getByRole('button', { name: 'Save' }).click();
    await settle(page, 2000);
    const body = await page.locator('body').innerText();
    record(
      'an entry past the limit is refused in the drawer, with the figures',
      body.includes('This goes past their credit limit') && body.includes('₹50,000.00'),
      body.split('\n').filter((line) => line.includes('limit')).join(' | ')
    );
    record(
      'and never as a doubled rupee symbol',
      !body.includes('₹₹'),
      ''
    );
    record(
      'and an owner is offered the override',
      (await page.getByRole('button', { name: 'Save anyway' }).count()) > 0,
      ''
    );

    const before = posts.length;
    if ((await page.getByRole('button', { name: 'Save anyway' }).count()) === 0) {
      record('which resends the same key rather than starting a second entry', false, '(no override button to press)');
      record('and the entry is written once, not twice', false, '(skipped)');
      await page.keyboard.press('Escape');
      await settle(page, 500);
      return;
    }
    await page.getByRole('button', { name: 'Save anyway' }).click();
    await settle(page, 2500);
    const issued = posts.slice(before);
    record(
      'which resends the same key rather than starting a second entry',
      issued.length === 1 && issued[0].key === posts[before - 1]?.key,
      issued.length === 1 ? `same key: ${issued[0].key === posts[before - 1]?.key}` : `${issued.length} requests`
    );
    /* 40,000 seeded + 15,000 from the warn check + 20,000 here. The point of
       the assertion is the "once": an override that resent the key as a new
       request would show 95,000. */
    const detail = await api('GET', `/parties/${parties.near.id}`, null, token);
    record(
      'and the entry is written once, not twice',
      detail.body?.data?.summary?.balance === '75000.00',
      detail.body?.data?.summary?.balance ?? '(no summary)'
    );
  }

  // 10. The server refuses a write the client never drew a button for.
  {
    const refused = await api(
      'POST',
      `/parties/${parties.near.id}/ledger-entries`,
      { direction: 'debit', amount: '5000.00', entry_date: today() },
      token,
      { 'Idempotency-Key': `nolimit-${stamp}` }
    );
    record(
      'the server refuses a blocked entry even with no override asked for',
      refused.status === 409 && refused.body?.error?.code === 'credit_limit_exceeded',
      `${refused.status} ${refused.body?.error?.code ?? ''}`
    );
    await setCreditMode('warn', parties.near.id);
  }

  // 10. An archived party takes nothing (BR-9).
  {
    await must('POST', `/parties/${parties.empty.id}/archive`, { reason: 'e2e' }, token, {
      'Idempotency-Key': `arch-${stamp}`,
    });
    const refused = await postEntry(parties.empty.id, { direction: 'debit', amount: '10.00' }, token);
    record(
      'an archived khata takes no new entries',
      refused.status === 409 && refused.body?.error?.code === 'party_archived',
      `${refused.status} ${refused.body?.error?.code ?? ''}`
    );
    await must('POST', `/parties/${parties.empty.id}/restore`, {}, token, {
      'Idempotency-Key': `rest-${stamp}`,
    });
  }

  // 11. A replay is a replay, not a second sale.
  {
    const key = `replay-${stamp}`;
    const first = await postEntry(parties.advance.id, { direction: 'debit', amount: '111.00' }, token, key);
    const second = await postEntry(parties.advance.id, { direction: 'debit', amount: '111.00' }, token, key);
    record(
      'a replayed save returns the first entry rather than posting a second',
      first.body?.data?.id === second.body?.data?.id &&
        second.headers.get('idempotent-replayed') === 'true',
      `${first.body?.data?.id === second.body?.data?.id} / ${second.headers.get('idempotent-replayed')}`
    );
  }

  // 12. The ledger cannot be edited, by anything.
  {
    const entry = await api('GET', `/parties/${parties.advance.id}/ledger-entries`, null, token);
    const id = entry.body?.data?.[0]?.id;
    const patched = await api('PATCH', `/ledger-entries/${id}`, { amount: '1.00' }, token);
    const deleted = await api('DELETE', `/ledger-entries/${id}`, null, token);
    record(
      'the route offers no verb that edits or deletes a posted line',
      patched.status === 405 && deleted.status === 405,
      `PATCH ${patched.status}, DELETE ${deleted.status}`
    );
  }

  // ── LED-02, the opening balance ──────────────────────────────────────────

  // 13. A party created WITH one already carries it (FR-2).
  {
    await openKhata(page, parties.migrated);
    const body = await page.locator('body').innerText();
    record(
      'a party created with an opening balance already has the row',
      body.includes('Opening balance') && body.includes('₹2,300.00'),
      body.split('\n').filter((line) => line.includes('Opening')).join(' | ') || '(absent)'
    );
    record(
      'and the row wears the badge that says it is not a transaction',
      body.includes('Opening'),
      ''
    );
  }

  // 14. A party without one is offered the drawer, and it works (FR-3).
  {
    await openKhata(page, parties.fresh);
    await openHeaderMenu(page);
    const action = page.getByRole('button', { name: 'Add opening balance' });
    record(
      'a party with no opening is offered one',
      (await action.count()) > 0,
      (await action.count()) > 0 ? '' : '(no action)'
    );
    await action.first().click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await settle(page, 800);

    const amount = page.getByLabel('Amount');
    await amount.fill('4500');
    await amount.blur();
    await settle(page, 400);
    const hint = await page.locator('role=dialog').innerText();
    record(
      'the drawer says the whole sentence back, in grouped rupees',
      hint.includes('You will get ₹4,500.00'),
      hint.split('\n').filter((line) => line.includes('You will')).join(' | ') || '(no hint)'
    );
    record(
      'and never with a doubled rupee symbol',
      !hint.includes('₹₹'),
      ''
    );

    await page.getByRole('button', { name: 'Save opening balance' }).click();
    await settle(page, 2500);
    const detail = await api('GET', `/parties/${parties.fresh.id}`, null, token);
    record(
      'saving it moves the balance to what was typed',
      detail.body?.data?.summary?.balance === '4500.00',
      detail.body?.data?.summary?.balance ?? '(no summary)'
    );
    await openHeaderMenu(page);
    record(
      'and the action disappears without a reload',
      (await page.getByRole('button', { name: 'Add opening balance' }).count()) === 0,
      ''
    );
    await page.keyboard.press('Escape');
    await settle(page, 400);
  }

  // 15. A supplier-only party starts on the other side (§8 / T-LED-02-4).
  {
    await openKhata(page, parties.supplier);
    await openHeaderMenu(page);
    await page.getByRole('button', { name: 'Add opening balance' }).first().click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await settle(page, 700);
    record(
      'a supplier-only party starts on "I owe them"',
      await page.getByRole('radio', { name: 'I owe them' }).isChecked(),
      ''
    );
    await page.keyboard.press('Escape');
    await settle(page, 500);
  }

  // 16. One per party, whatever the client drew (BR-2).
  {
    const second = await api(
      'POST',
      `/parties/${parties.migrated.id}/ledger-entries`,
      {
        entry_type: 'opening',
        direction: 'debit',
        amount: '999.00',
        entry_date: '2026-04-01',
      },
      token,
      { 'Idempotency-Key': `second-opening-${stamp}` }
    );
    record(
      'a second opening balance is refused by the server',
      second.status === 409 && second.body?.error?.code === 'opening_balance_exists',
      `${second.status} ${second.body?.error?.code ?? ''}`
    );
  }

  // 17. `opening` is the ONE entry type a client may name (CR-037).
  {
    const forged = await api(
      'POST',
      `/parties/${parties.plain.id}/ledger-entries`,
      {
        entry_type: 'reversal',
        direction: 'credit',
        amount: '10.00',
        entry_date: today(),
        payment_mode: 'cash',
      },
      token,
      { 'Idempotency-Key': `forged-${stamp}` }
    );
    record(
      'a client cannot name any other entry type',
      forged.status === 400,
      `${forged.status} ${forged.body?.error?.code ?? ''}`
    );
  }


  // ── LED-03, corrections and reversals ────────────────────────────────────
  //
  // The half a unit test cannot reach: that the row the merchant taps sends the
  // request the server expects, that the BALANCE moves on the header and in the
  // database by the same amount, that the struck-through history is one switch
  // away, and that a retry does not undo an entry twice.

  // 18. The menu, and what it offers on a hand-written line.
  {
    const page = await ctx.newPage();
    await signIn(page);
    await openKhata(page, parties.fix);
    await page.getByRole('button', { name: 'More actions for Cement bags' }).click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await settle(page, 500);
    const offered = await page.locator('role=dialog').innerText();
    record(
      'a hand-written line offers both ways of fixing it',
      offered.includes('Correct this entry') && offered.includes('Reverse this entry'),
      offered.split('\n').filter(Boolean).slice(0, 4).join(' | ')
    );
    // Said once, in the menu, so a merchant expecting a delete is not surprised
    // by a strike-through after the fact.
    record(
      'and says the original stays in the book either way',
      /stays in the book/i.test(offered)
    );
    await page.keyboard.press('Escape');
    await page.close();
  }

  // 19. Reversing through the UI: the request, the balance and the row.
  {
    const page = await ctx.newPage();
    const sent = [];
    page.on('request', (req) => {
      if (req.url().includes('/reverse')) sent.push(req.url());
    });
    await signIn(page);
    await openKhata(page, parties.fix);

    await page.getByRole('button', { name: 'More actions for Cement bags' }).click();
    await settle(page, 500);
    await page.getByRole('button', { name: 'Reverse this entry' }).click();
    await page.waitForSelector('text=Reverse this entry?', { timeout: 15000 });
    await settle(page, 600);

    // The row is restated inside the dialog — the ⋯ covered it, and on a phone
    // the list has very likely scrolled.
    const confirming = await page.locator('role=dialog').innerText();
    record(
      'the confirmation names the entry rather than "this entry"',
      confirming.includes('Cement bags') && confirming.includes('500.00'),
      confirming.split('\n').filter(Boolean).slice(0, 5).join(' | ')
    );

    // §10 — the reason cannot be skipped.
    await page.getByRole('button', { name: 'Reverse entry' }).click();
    await settle(page, 700);
    record(
      'a reversal with no reason is refused before it is sent',
      sent.length === 0 && (await page.locator('role=dialog').isVisible()),
      `${sent.length} requests`
    );

    await page.getByLabel('Reason').fill('Duplicate entry');
    await page.getByRole('button', { name: 'Reverse entry' }).click();
    await settle(page, 2000);

    record('reversing reaches the wire', sent.length === 1, sent.join(' '));

    // The balance, in the database, by a different route from the screen.
    const after = await must('GET', `/parties/${parties.fix.id}`, null, token);
    record(
      'the balance comes back by the amount that was undone',
      after.body.data.balance === '800.00',
      `balance ${after.body.data.balance}`
    );

    // And on the header the merchant is looking at, without a reload — the
    // defect LED-01 shipped, one feature later.
    const header = await page.locator('body').innerText();
    record(
      'and the khata header moves without a reload',
      header.includes('800.00') && !header.includes('1,300.00'),
      header.includes('800.00') ? 'header shows 800.00' : 'header did NOT move'
    );

    // FR-7's default: one typo must not turn one line into three on the screen
    // a merchant reads at the counter.
    record(
      'the undone line leaves the clean timeline',
      !header.includes('Cement bags'),
      header.includes('Cement bags') ? 'still listed' : 'hidden'
    );
    await page.close();
  }

  // 20. "Show corrections" — the request it makes and what comes back.
  {
    const page = await ctx.newPage();
    const asked = [];
    page.on('request', (req) => {
      if (req.url().includes('ledger-entries') && req.url().includes('include_reversed')) {
        asked.push(req.url());
      }
    });
    await signIn(page);
    await openKhata(page, parties.fix);

    await page.getByRole('switch', { name: 'Show corrections' }).click();
    await settle(page, 2000);

    /* The ASSERTION is the request. A switch that flips a flag and filters what
       is already held would be wrong in both directions — the reversed rows were
       never downloaded — and `e2e/parties.mjs` exists because of a control that
       lit up and issued nothing at all. */
    record(
      'showing corrections asks the server for the struck-through rows',
      asked.some((url) => url.includes('include_reversed=true')),
      asked[0] ?? 'no request carried the parameter'
    );

    const shown = await page.locator('body').innerText();
    record(
      'and the undone line comes back, marked as undone',
      shown.includes('Cement bags') && shown.includes('Reversed'),
      shown.includes('Cement bags') ? 'listed with its badge' : 'still hidden'
    );
    await page.close();
  }

  // 21. Correcting through the UI, on the entry the reversal left alone.
  {
    const page = await ctx.newPage();
    await signIn(page);
    await openKhata(page, parties.fix);

    await page.getByRole('button', { name: 'More actions for Sand load' }).click();
    await settle(page, 500);
    await page.getByRole('button', { name: 'Correct this entry' }).click();
    await page.waitForSelector('role=dialog', { timeout: 15000 });
    await settle(page, 800);

    /* It opens on what is there. A correction is an edit in the merchant's
       head whatever it is in the database, and an empty form would make them
       retype an amount, a date and a note to change one digit. */
    record(
      'the correction form opens on the values the entry already has',
      (await page.getByLabel('Amount').inputValue()) === '800.00' &&
        (await page.getByLabel(/Note/).inputValue()) === 'Sand load',
      `amount ${await page.getByLabel('Amount').inputValue()}`
    );

    await fillAmount(page, '850.00');
    await page.getByLabel('Reason').fill('Recounted the load');
    await page.getByRole('button', { name: 'Save correction' }).click();
    await settle(page, 2200);

    const after = await must('GET', `/parties/${parties.fix.id}`, null, token);
    record(
      'correcting lands on the new figure, not on the sum of both',
      after.body.data.balance === '850.00',
      `balance ${after.body.data.balance}`
    );

    const body = await page.locator('body').innerText();
    record(
      'and the replacement is the only one of the three on a clean timeline',
      body.includes('850.00') && !body.includes('800.00'),
      body.includes('850.00') ? 'shows 850.00 alone' : 'replacement missing'
    );
    await page.close();
  }

  // 22. A corrected row says "Corrected", not "Reversed".
  {
    const page = await ctx.newPage();
    await signIn(page);
    await openKhata(page, parties.fix);
    await page.getByRole('switch', { name: 'Show corrections' }).click();
    await settle(page, 2000);
    const shown = await page.locator('body').innerText();
    /* Both are struck through and they are not the same event: "Corrected" says
       a replacement is standing somewhere in this khata, "Reversed" says the
       money simply came back out. A merchant at a dispute needs to know which. */
    record(
      'a corrected line and a reversed line are told apart',
      shown.includes('Corrected') && shown.includes('Reversed'),
      shown.includes('Corrected') ? 'both badges present' : 'no Corrected badge'
    );
    await page.close();
  }

  // 23. The chain, from the detail read (FR-8).
  {
    const listed = await must(
      'GET',
      `/parties/${parties.fix.id}/ledger-entries?include_reversed=true`,
      null,
      token
    );
    const original = listed.body.data.find((row) => row.note === 'Cement bags');
    const chain = await must('GET', `/ledger-entries/${original.id}`, null, token);
    record(
      'the detail carries the whole chain, oldest first',
      chain.body.data.history?.length === 2 &&
        chain.body.data.history[0].entry_type === 'manual_gave' &&
        chain.body.data.history[1].entry_type === 'reversal',
      (chain.body.data.history ?? []).map((row) => row.entry_type).join(' -> ')
    );
  }

  // 24. Reversing twice is refused, and a RETRY is not a second reversal.
  {
    const listed = await must(
      'GET',
      `/parties/${parties.plain.id}/ledger-entries`,
      null,
      token
    );
    const target = listed.body.data[0];
    const key = `reverse-retry-${stamp}`;
    const first = await api(
      'POST',
      `/ledger-entries/${target.id}/reverse`,
      { reason: 'Wrong party' },
      token,
      { 'Idempotency-Key': key }
    );
    const retried = await api(
      'POST',
      `/ledger-entries/${target.id}/reverse`,
      { reason: 'Wrong party' },
      token,
      { 'Idempotency-Key': key }
    );
    /* The most damaging failure this feature could have, and the reason the
       route is idempotent at all: a lost response on a 2G connection retried
       would otherwise move the balance a second time, by the same amount, in
       the same direction. The 409 below would catch it — but it would tell the
       merchant they had already done something they never saw succeed. */
    record(
      'a retried reverse replays the first answer rather than undoing twice',
      first.status === 200 &&
        retried.status === 200 &&
        first.body.data.id === retried.body.data.id,
      `${first.status}/${retried.status}`
    );

    const again = await api(
      'POST',
      `/ledger-entries/${target.id}/reverse`,
      { reason: 'Again' },
      token,
      { 'Idempotency-Key': `reverse-again-${stamp}` }
    );
    record(
      'a genuinely second reversal is refused',
      again.status === 409 && again.body?.error?.code === 'entry_already_reversed',
      `${again.status} ${again.body?.error?.code ?? ''}`
    );
  }

  // 25. BR-8 — staff post at the counter and do not rewrite the book.
  {
    const staffToken = await staffSession(token);
    const listed = await must(
      'GET',
      `/parties/${parties.busy.id}/ledger-entries`,
      null,
      staffToken
    );
    const target = listed.body.data[0];
    const refused = await api(
      'POST',
      `/ledger-entries/${target.id}/reverse`,
      { reason: 'Not mine to undo' },
      staffToken,
      { 'Idempotency-Key': `staff-reverse-${stamp}` }
    );
    record(
      'staff may post an entry and may not reverse one',
      refused.status === 403,
      `${refused.status} ${refused.body?.error?.code ?? ''}`
    );

    /* Its OWN browser context, and the identity asserted before anything else.
 
       `ctx` is one context shared by every check in this file, and the owner
       signed into it pages ago. `signIn` ends by loading /parties and waiting
       for the grid — which appears for the OWNER's still-valid session whether
       or not the staff login worked. The first version of this check reported
       "13 menus" and looked like a permission leak; it was the harness, quietly
       asserting against the owner's khata. A check that cannot fail for the
       reason it names is worse than no check. */
    const staffCtx = await browser.newContext();
    const page = await staffCtx.newPage();
    await signIn(page, STAFF);
    const whoami = await api('GET', '/auth/me', null, staffToken);
    const signedInAs = await page.evaluate(() => {
      try {
        return window.localStorage.getItem('ub.session.email') ?? '';
      } catch {
        return '';
      }
    });
    record(
      'the staff session in the browser is the staff member',
      whoami.body?.data?.user?.email === STAFF.email,
      `api ${whoami.body?.data?.user?.email ?? '?'} | storage ${signedInAs || 'n/a'}`
    );

    await openKhata(page, parties.busy);
    const menus = await page.getByRole('button', { name: /More actions for/ }).count();
    const shown = await page.locator('body').innerText();
    record(
      'and the khata offers them no ⋯ at all',
      menus === 0,
      `${menus} menus; entries visible: ${/You gave/.test(shown)}`
    );
    record(
      'nor the switch that reveals corrections',
      (await page.getByRole('switch', { name: 'Show corrections' }).count()) === 0
    );
    await page.close();
    await staffCtx.close();
  }

  // 26. BR-9 — correcting an opening keeps it an opening.
  {
    const listed = await must(
      'GET',
      `/parties/${parties.migrated.id}/ledger-entries`,
      null,
      token
    );
    const opening = listed.body.data.find((row) => row.entry_type === 'opening');
    const fixed = await must(
      'POST',
      `/ledger-entries/${opening.id}/correct`,
      { amount: '3200.00', reason: 'Read the paper book wrong' },
      token,
      { 'Idempotency-Key': `correct-opening-${stamp}` }
    );
    /* LED-02's unique index is partial on `status='posted'` for exactly this,
       and it is the acceptance criterion LED-02 could not carry: the original
       becomes `reversed` first, so the index is free when the replacement
       opening is written. The merchant most likely to mistype an opening is the
       one typing forty of them off a paper book on their first afternoon. */
    record(
      'correcting an opening balance leaves it an opening',
      fixed.body.data.entry_type === 'opening' && fixed.body.data.supersedes_id === opening.id,
      `${fixed.body.data.entry_type}, supersedes ${fixed.body.data.supersedes_id ? 'set' : 'MISSING'}`
    );
    const party = await must('GET', `/parties/${parties.migrated.id}`, null, token);
    record(
      'and the balance is the corrected figure, not the sum of both',
      party.body.data.balance === '3200.00',
      `balance ${party.body.data.balance}`
    );
  }

  await ctx.close();
}

async function run() {
  const { token, parties } = await seed();

  const browser = await chromium.launch();
  await checks(browser, token, parties);

  if (wantShots) {
    /* `block` for the whole sweep, because shot 09 is the refusal banner and
       the checks above put the tenant back to `warn` when they finished. The
       first run of this sweep produced four "captures did not happen" for
       exactly that reason — which is the harness reporting rather than a
       screenshot quietly showing the wrong state, and is why the step waits for
       the banner instead of photographing whatever is there. */
    await setCreditMode('block', parties.near.id);
    for (const size of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await sweep(ctx, size, parties);
      await ctx.close();
    }
    await setCreditMode('warn', parties.near.id);
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
