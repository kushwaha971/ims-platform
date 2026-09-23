/**
 * writeoff.mjs — PTY-04 FR-3 end to end: a party who owes ₹2,300 cannot be
 * archived, the dialog offers Record payment and Write off, the write-off
 * waits for a reason and an acknowledgement, and afterwards the party is
 * archived at ₹0 with a Write-off row on its khata (T-PTY-04-16/17).
 *
 * It asserts the NETWORK and the SCREEN, not the controls: the body that left
 * the browser carries the amount the dialog showed, and the timeline the
 * merchant reads afterwards carries the row. `--shots` photographs the blocked
 * dialog, the empty and the filled write-off form, and the khata after, at
 * four widths, into $E2E_SHOTS/writeoff.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
const SHOT_DIR = `${process.env.E2E_SHOTS ?? '/tmp/e2e-shots'}/writeoff`;
const wantShots = process.argv.includes('--shots');

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check}${detail ? `\n        ${detail}` : ''}`);
};

const stamp = Date.now();
const OWNER = { email: `wo-${stamp}@shop.test`, password: 'Dukaan2026x', name: 'Owner Person' };

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
  const payload = await response.json().catch(() => null);
  return { status: response.status, body: payload };
};
const must = async (...args) => {
  const response = await api(...args);
  if (response.status >= 400) throw new Error(`${args[1]} ${response.status}: ${JSON.stringify(response.body)}`);
  return response;
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function seed(count) {
  const registered = await must('POST', '/auth/register', {
    email: OWNER.email,
    password: OWNER.password,
    full_name: OWNER.name,
  });
  await must('POST', '/tenants', { name: 'Kumar Stores', business_type: 'retail', state_code: '27' },
    registered.body.data.access_token, { 'Idempotency-Key': `tenant-${stamp}` });
  const token = (await must('POST', '/auth/login', { email: OWNER.email, password: OWNER.password }))
    .body.data.access_token;
  // One owing party per screenshot size, plus one for the assertions.
  const parties = [];
  for (let i = 0; i < count; i += 1) {
    const made = await must('POST', '/parties', {
      name: `Naidu Agency ${i + 1}`,
      is_customer: true,
      mobile: null,
      opening_balance_amount: '2300.00',
      opening_balance_direction: 'debit',
      opening_balance_as_of: daysAgo(90),
    }, token, { 'Idempotency-Key': `p-${stamp}-${i}` });
    parties.push(made.body.data.id);
  }
  return { token, parties };
}

const signIn = async (page) => {
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', OWNER.email);
  await page.fill('input[type="password"]', OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
  await page.waitForTimeout(2000);
};

const SIZES = [
  { id: 'phone', width: 360, height: 780 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
];

/** Opens the khata, the ⋯ menu, Archive, and confirms — reaching the blocked state. */
async function reachBlocked(page, partyId) {
  await page.goto(`${FRONTEND}/parties/${partyId}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.getByRole('heading', { name: /Naidu Agency/ }).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('button', { name: 'Archive' }).last().click();
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: 'Archive' }).click();
  await dialog.getByText(/still owes you/).waitFor({ timeout: 30000 });
  return dialog;
}

async function writeOff(page, dialog, sizeId) {
  await dialog.getByRole('button', { name: /^Write off ₹/ }).click();
  await dialog.getByRole('button', { name: 'Write off and archive' }).waitFor();
  if (sizeId) await page.screenshot({ path: `${SHOT_DIR}/${sizeId}/2-form-empty.png` });
  await dialog.getByLabel('Why are you writing this off?').fill('Shop closed, cannot recover');
  await dialog.getByLabel('I understand this money is written off').click();
  if (sizeId) await page.screenshot({ path: `${SHOT_DIR}/${sizeId}/3-form-filled.png` });
}

const main = async () => {
  const { token, parties } = await seed(1 + (wantShots ? SIZES.length : 0));
  const browser = await chromium.launch();

  // ── Assertions, at a laptop width ────────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await signIn(page);
    const dialog = await reachBlocked(page, parties[0]);

    record('a party who owes money cannot be archived, and the dialog says how much',
      await dialog.getByText('₹2,300.00').first().isVisible());
    record('both ways out are offered',
      (await dialog.getByRole('button', { name: 'Record payment' }).count()) === 1 &&
        (await dialog.getByRole('button', { name: /^Write off ₹2,300/ }).count()) === 1);

    await dialog.getByRole('button', { name: /^Write off ₹/ }).click();
    const confirm = dialog.getByRole('button', { name: 'Write off and archive' });
    record('the write-off waits for a reason and the acknowledgement', await confirm.isDisabled());
    await dialog.getByLabel('Why are you writing this off?').fill('Shop closed, cannot recover');
    record('a reason alone is not enough', await confirm.isDisabled());
    await dialog.getByLabel('I understand this money is written off').click();
    record('both together enable it', await confirm.isEnabled());

    const request = page.waitForRequest((r) => r.url().includes(`/parties/${parties[0]}/archive`) && r.method() === 'POST');
    const response = page.waitForResponse((r) => r.url().includes(`/parties/${parties[0]}/archive`) && r.request().method() === 'POST');
    await confirm.click();
    const body = JSON.parse((await request).postData() ?? '{}');
    const answered = await response;
    record('the request carries the amount the dialog showed',
      body.write_off?.amount === '2300.00' && body.write_off?.reason === 'Shop closed, cannot recover',
      JSON.stringify(body));
    record('the server writes it off and archives', answered.status() === 200, `status ${answered.status()}`);

    await page.getByText('This party is archived').waitFor({ timeout: 30000 });
    record('the khata says archived', true);
    const detail = await must('GET', `/parties/${parties[0]}`, null, token);
    record('the balance is ₹0', detail.body.data.balance === '0.00' || detail.body.data.party?.balance === '0.00',
      JSON.stringify(detail.body.data.balance ?? detail.body.data.party?.balance));
    const entries = await must('GET', `/parties/${parties[0]}/ledger-entries`, null, token);
    const row = (entries.body.data ?? []).find((e) => e.entry_type === 'write_off');
    record('one write-off entry of ₹2,300 carries the reason',
      Boolean(row) && row.amount === '2300.00' && row.direction === 'credit' && row.note === 'Shop closed, cannot recover',
      row ? `${row.direction} ${row.amount} ${row.note}` : 'no write_off row');
    await page.getByText('Shop closed, cannot recover').first().waitFor({ timeout: 30000 }).catch(() => {});
    record('and the timeline shows it without a reload',
      await page.getByText('Shop closed, cannot recover').first().isVisible().catch(() => false));
    await context.close();
  }

  // ── Screenshots ──────────────────────────────────────────────────────────
  if (wantShots) {
    for (const [index, size] of SIZES.entries()) {
      mkdirSync(`${SHOT_DIR}/${size.id}`, { recursive: true });
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await context.newPage();
      await signIn(page);
      const dialog = await reachBlocked(page, parties[index + 1]);
      await page.screenshot({ path: `${SHOT_DIR}/${size.id}/1-blocked.png` });
      await writeOff(page, dialog, size.id);
      await dialog.getByRole('button', { name: 'Write off and archive' }).click();
      await page.getByText('This party is archived').waitFor({ timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOT_DIR}/${size.id}/4-after.png` });
      // Width check: nothing on the page may run past the viewport.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      record(`${size.id}: the page fits the viewport after a write-off`, overflow <= 0, `overflow ${overflow}px`);
      await context.close();
    }
  }

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
};
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
