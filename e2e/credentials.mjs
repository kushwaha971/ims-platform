#!/usr/bin/env node
/**
 * e2e/credentials.mjs — DEC-012, driven through a real browser.
 *
 * This feature cannot be trusted on unit tests alone, and the reason is
 * specific: the password exists in exactly ONE response and is then only a
 * hash. Every part of the chain — the 201's body, the store, the dialog, the
 * merchant's clipboard, the login form, the server's gate — has to carry it
 * intact, and a break anywhere looks identical from either end. The backend
 * suite proves the server issues a password that works; the frontend suite
 * proves the dialog renders whatever the mocked service returned. Only this
 * proves that the password an OWNER can actually read off the screen is the one
 * the new member can actually sign in with.
 *
 * It also proves the thing with the worst failure mode: that the forced change
 * is enforced by the SERVER and not merely suggested by the client. A member
 * created this way must not be able to read the business's books with the
 * password they were sent.
 *
 *   node e2e/credentials.mjs
 *   node e2e/credentials.mjs --shots
 *
 * DEC-013 (owner, 9 Oct 2026) changed the screen: an owner adds staff by
 * name, mobile and role, sees no password, and the member signs in with that
 * number and a texted code. The first half walks THAT, through the UI, reading
 * the code from the API log (console SMS backend, $UB_E2E_LOGS/be-run.log).
 * The temporary-password path is kept on the server for accounts made with an
 * email, so the second half mints one through the API and proves the forced
 * change is still the SERVER's, exactly as before.
 *
 * Exits non-zero on any failure, so it can gate a commit.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertE2eApi } from './lib/local.mjs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = process.env.E2E_SHOTS ?? '/tmp/e2e-shots';
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok, detail });
  process.stdout.write(`${ok ? '  ok  ' : '  FAIL'}  ${check}${detail ? `  — ${detail}` : ''}\n`);
};

const shot = async (page, name) => {
  if (!wantShots) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/cred-${name}.png`, fullPage: true });
};

/**
 * Console noise this script CAUSES and must not then report as a defect:
 *
 *  · 401 — every page boots a session fetch, and on `/login` the visitor is by
 *    definition anonymous. The browser logs the failed request whatever the app
 *    does with it.
 *  · 403 — the gate probe below fires `GET /parties` expecting to be refused.
 *    That refusal is the assertion, not a symptom.
 *
 * Anything else is a real error and fails the run.
 */
const keep = (text) => !/(401|403)\s*\(?(Unauthorized|Forbidden)?\)?/i.test(text);

const stamp = Date.now();
const OWNER = { email: `owner-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };
const STAFF = { email: `staff-${stamp}@shop.test`, name: 'Ramesh Kumar' };
const MOBILE_STAFF = { name: 'Suresh Yadav', national: `8${String(stamp).slice(-9)}` };
const LOGS = process.env.UB_E2E_LOGS ?? '/tmp';
let ownerToken = null;

/** The newest code the console SMS backend logged for a number ending in `last3`. */
const codeFromLog = async (last3, notBefore) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let log = '';
    try { log = readFileSync(join(LOGS, 'be-run.log'), 'utf8').slice(notBefore); } catch { /* not yet */ }
    const hits = [...log.matchAll(/sms\.console to=\+91…(\d{3}) body=(\d{6}) is your/g)].filter((m) => m[1] === last3);
    if (hits.length) return hits[hits.length - 1][2];
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};
const logSize = () => { try { return readFileSync(join(LOGS, 'be-run.log'), 'utf8').length; } catch { return 0; } };

/** Sign up an owner and a business through the API — this script is not about that path. */
async function seedOwner() {
  const register = await fetch(`${BACKEND}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'api' },
    body: JSON.stringify({
      email: OWNER.email,
      password: OWNER.password,
      full_name: OWNER.name,
    }),
  });
  if (!register.ok) throw new Error(`register ${register.status}: ${await register.text()}`);
  const token = (await register.json()).data.access_token;

  const tenant = await fetch(`${BACKEND}/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'api',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': `tenant-${stamp}`,
    },
    body: JSON.stringify({ name: "Kumar Stores", business_type: "retail", state_code: "27" }),
  });
  if (!tenant.ok) throw new Error(`tenant ${tenant.status}: ${await tenant.text()}`);
  // Signing in again picks the new business as the token's active tenant.
  const login = await fetch(`${BACKEND}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'api' },
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
  });
  ownerToken = (await login.json()).data.access_token;
}

const signIn = async (page, email, password) => {
  await page.goto(`${FRONTEND}/login/email`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
};

async function run() {
  // A made-up number is about to ask for a code: only ever from the e2e API.
  await assertE2eApi();
  await seedOwner();
  const browser = await chromium.launch();
  const viewport = { width: 1440, height: 900 };

  // ── DEC-013: the owner adds a member by mobile; no password exists ───────
  {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && keep(m.text()) && consoleErrors.push(m.text()));

    await signIn(page, OWNER.email, OWNER.password);
    await page.goto(`${FRONTEND}/settings/team`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    await shot(page, '01-team');

    const addButton = page.getByRole('button', { name: /Add member/i });
    record('the team screen offers "Add member"', (await addButton.count()) > 0);
    await addButton.first().click();
    await page.waitForTimeout(900);

    record('the form asks for no email and no password',
      (await page.getByLabel(/Email/i).count()) === 0 && (await page.locator('input[type="password"]').count()) === 0);
    await page.getByLabel(/Full name/i).fill(MOBILE_STAFF.name);
    await page.getByLabel(/Mobile number/i).first().fill(MOBILE_STAFF.national);
    await shot(page, '02-add-form');
    await page.getByRole('button', { name: /Add to team/i }).click();
    await page.waitForTimeout(2500);
    await shot(page, '03-on-your-team');

    record('it confirms the member is on the team',
      await page.getByText(`${MOBILE_STAFF.name} is on your team`).isVisible().catch(() => false));
    record('and shows no password', (await page.getByTestId('credentials-password').count()) === 0);
    const body = await page.locator('body').innerText();
    record('it says they sign in with their number', body.includes(MOBILE_STAFF.national.slice(-5)), body.slice(0, 200));
    record('no console errors on the owner path', consoleErrors.length === 0, consoleErrors.join(' | '));
    await ctx.close();
  }

  // ── The member signs in with that number and a code ──────────────────────
  {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.getByLabel('Mobile number').fill(MOBILE_STAFF.national);
    const before = logSize();
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByRole('heading', { name: 'Enter the code' }).waitFor({ timeout: 30000 }).catch(() => {});
    const code = await codeFromLog(MOBILE_STAFF.national.slice(-3), before);
    record('a code is sent to the number the owner typed', Boolean(code));
    if (code) {
      await page.getByRole('textbox').first().focus();
      await page.keyboard.type(code);
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    await shot(page, '04-mobile-member-in');
    // Straight into the owner's business — not onboarding (they own nothing)
    // and not a password screen (they have none).
    record('the code gets the member straight into the business',
      !/\/(login|onboarding|set-password)/.test(page.url()), page.url());
    await ctx.close();
  }

  // ── DEC-012, kept on the server: an email member gets a temporary password ─
  let issuedPassword = null;
  {
    const created = await fetch(`${BACKEND}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client': 'api',
        Authorization: `Bearer ${ownerToken}`,
        'Idempotency-Key': `member-${stamp}`,
      },
      body: JSON.stringify({ full_name: STAFF.name, email: STAFF.email, role: 'staff' }),
    });
    const json = await created.json().catch(() => ({}));
    issuedPassword = json?.data?.password ?? null;
    record('the server still issues a temporary password for an email member', created.status === 201 && Boolean(issuedPassword), `${created.status}`);
    record('the password is typeable — no lookalike characters', Boolean(issuedPassword) && !/[IlO01]/.test(issuedPassword), issuedPassword ?? '');
  }

  if (!issuedPassword) {
    record('ABORTED — no password to continue with', false);
    return finish(browser);
  }

  // ── The new member signs in with it, in a browser that has never been here ─
  {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && keep(m.text()) && consoleErrors.push(m.text()));

    await signIn(page, STAFF.email, issuedPassword);
    // UAT harness fix — sign-in lands on /dashboard first and the forced
    // change redirects from there; reading the URL after a fixed 1.5 s raced
    // that redirect. Wait for it (bounded), then assert.
    await page.waitForURL(/\/set-password/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, '04-forced-change');

    record(
      'the password from the dialog actually signs in',
      !page.url().includes('/login'),
      page.url()
    );
    record(
      'and lands on the change-password screen, not the dashboard',
      page.url().includes('/set-password'),
      page.url()
    );

    const heading = await page.locator('body').innerText();
    record(
      'which says why, in the words a shop assistant would read',
      /Choose your own password/i.test(heading)
    );
    record('with no way to skip it', !/\bSkip\b/i.test(heading));

    // ── The server, not the client, is what refuses ─────────────────────────
    // The whole security argument. If this passes with a 200, anyone holding a
    // password sent over WhatsApp can read the business's books with curl.
    const direct = await page.evaluate(async (backend) => {
      const response = await fetch(`${backend}/parties`, { credentials: 'include' });
      let code = null;
      try {
        code = (await response.json())?.error?.code ?? null;
      } catch {
        /* no body */
      }
      return { status: response.status, code };
    }, BACKEND);
    record(
      'the SERVER refuses a business route, not just the client',
      direct.status === 403 && direct.code === 'password_change_required',
      `${direct.status} ${direct.code}`
    );

    // ── Changing it opens the product ───────────────────────────────────────
    const fields = page.locator('input[type="password"]');
    record('the form asks for the temporary password and a new one', (await fields.count()) === 2,
      `${await fields.count()} password field(s)`);
    await fields.nth(0).fill(issuedPassword);
    await fields.nth(1).fill('MeraApnaPass91');
    await page.getByRole('button', { name: /Save and continue/i }).click();
    await page.waitForTimeout(3500);
    await shot(page, '05-after-change');

    record(
      'saving lands them in the product rather than back on this screen',
      !page.url().includes('/set-password'),
      page.url()
    );

    const after = await page.evaluate(async (backend) => {
      const response = await fetch(`${backend}/parties`, { credentials: 'include' });
      return response.status;
    }, BACKEND);
    record('and the business routes answer now', after === 200, String(after));

    record('no console errors on the member path', consoleErrors.length === 0, consoleErrors.join(' | '));
    await ctx.close();
  }

  // ── The old password is dead, and the new one is theirs ───────────────────
  {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await signIn(page, STAFF.email, issuedPassword);
    await page.waitForTimeout(1200);
    record(
      'the temporary password stops working once replaced',
      page.url().includes('/login'),
      page.url()
    );
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await signIn(page, STAFF.email, 'MeraApnaPass91');
    await page.waitForTimeout(1200);
    // Not merely "somewhere that is not the login screen". A staff member used
    // to land in the owner's unfinished onboarding wizard, where every step
    // answers 403 and the router puts them back on each sign-in.
    record(
      'and the password they chose gets them straight into the product',
      !page.url().includes('/login') &&
        !page.url().includes('/set-password') &&
        !page.url().includes('/onboarding'),
      page.url()
    );
    await shot(page, '06-member-in');
    await ctx.close();
  }

  return finish(browser);
}

async function finish(browser) {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  writeFileSync('/tmp/e2e-credentials.json', JSON.stringify(results, null, 2));
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
