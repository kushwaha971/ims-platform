/**
 * e2e/lib/fixtures.mjs — fresh, isolated accounts for one harness run.
 *
 * Every harness that used to be handed a long-lived account (`--owner=`,
 * `--user=`, the retest state file) gets one built here instead, through the
 * public API, a few seconds before it starts. Nothing is shared between two
 * harnesses and nothing survives into the next run, so a book that grew over
 * twenty earlier runs can no longer push the party a check looks for off page
 * one.
 *
 * Registration is spent freely here. Against a local server started with
 * `UB_E2E_RELAX_THROTTLES=1` the per-IP sign-up budget is lifted (see
 * `backend/config/settings/local.py`); without it, 20 an hour applies and a
 * full concurrent run will hit 429 — `run-regression.mjs` checks for that
 * before it starts.
 *
 * Every function returns plain data: emails, the password, tenant ids.
 */
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';
export const PASSWORD = 'Dukaan2026x';
export const RT_PASSWORD = 'Dukaan2026xRetest!';

let seq = 0;
/** Unique across concurrent harnesses in one runner process and across runs. */
export const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A ten-digit Indian mobile nobody else holds (starts 6–9, as the validator wants). */
export const uniqMobile = () => `9${String(Date.now()).slice(-5)}${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export async function api(method, path, body, token, extra = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const r = await fetch(`${BACKEND}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Client': 'api',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(method !== 'GET' && !extra['Idempotency-Key'] ? { 'Idempotency-Key': `fx-${uniq()}` } : {}),
          ...extra,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: r.status, body: json };
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
}
export async function must(method, path, body, token, extra) {
  const r = await api(method, path, body, token, extra);
  if (r.status >= 400) throw new Error(`fixture: ${method} ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.data;
}

/** A signed-up user with no business. */
export async function newUser({ name = 'QA User', mobile, password = PASSWORD, prefix = 'qa' } = {}) {
  const email = `${prefix}-${uniq()}@e2e.test`;
  const d = await must('POST', '/auth/register', { email, password, full_name: name, ...(mobile ? { mobile } : {}) });
  return { email, password, name, mobile: d.user?.mobile ?? null, token: d.access_token };
}

/** Walk a just-created business through the wizard's marker (one step per PATCH, FR-1). */
async function complete(token) {
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, token);
}

/** Add a business to `user` (it becomes active). `done` finishes onboarding. */
export async function addBusiness(user, { shop, stateCode = '27', type = 'retail', done = true } = {}) {
  const d = await must('POST', '/tenants', { name: shop, business_type: type, state_code: stateCode }, user.token);
  user.token = d.access_token ?? user.token;
  if (done) await complete(user.token);
  return { id: d.tenant.id, name: shop };
}

/** A user who owns ONE completed business. */
export async function newOwner({ shop, name = 'QA Owner', stateCode = '27', mobile, prefix = 'qa-owner', password } = {}) {
  const user = await newUser({ name, mobile, prefix, password });
  const business = await addBusiness(user, { shop: shop ?? `QA Shop ${uniq()}`, stateCode });
  return { ...user, tenantId: business.id, shop: business.name };
}

export async function addParty(token, body) {
  return must('POST', '/parties', { is_customer: true, ...body }, token);
}

/**
 * The retest pair phase R, N1 and F3 of `sprint3-qa.mjs` sign in as.
 *   R1 — "Retest Budget Stores", onboarded, empty.
 *   R2 — "Retest Browser Traders", onboarded, with Upi Party owing money (so
 *        it is on /ledger/aging) and two more active parties.
 * Shape matches the historical `/tmp/claude-0/retest/state.json`.
 */
export async function seedRetestAccounts() {
  const r1 = await newOwner({ shop: 'Retest Budget Stores', name: 'Retest One', prefix: 'rt-r1', password: RT_PASSWORD });
  const r2 = await newOwner({ shop: 'Retest Browser Traders', name: 'Retest Two', prefix: 'rt-r2', password: RT_PASSWORD });
  const upi = await addParty(r2.token, { name: 'Upi Party', opening_balance_amount: '1250.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(40) });
  const smoke = await addParty(r2.token, { name: 'Smoke Party', opening_balance_amount: '300.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(5) });
  const zero = await addParty(r2.token, { name: 'Zero Smoke' });
  return {
    R1: { email: r1.email, tenant: r1.tenantId },
    R2: { email: r2.email, tenant: r2.tenantId },
    upi: upi.id, smoke: smoke.id, zero: zero.id,
  };
}

/**
 * An owner with a completed business whose SECOND business is unfinished.
 * `step` is where its wizard stands: 1 = only step 1 saved; 2 = step 2 saved
 * too, so /onboarding/step/3 is reachable (the wizard never skips ahead).
 */
export async function ownerWithUnfinished({ unfinishedShop, withBooks = false, step = 1 } = {}) {
  const owner = await newOwner({ prefix: 'qa-wiz' });
  const shop = unfinishedShop ?? `Unfinished ${uniq()}`;
  const second = await addBusiness(owner, { shop, stateCode: '32', done: false });
  for (let s = 2; s <= step; s += 1) await must('PATCH', '/tenants/current', { onboarding_step: s }, owner.token);
  if (withBooks) await addParty(owner.token, { name: `Books ${uniq()}` });
  return { ...owner, unfinished: second };
}

/** An owner with two completed businesses. */
export async function ownerWithTwoBusinesses() {
  const owner = await newOwner({ prefix: 'qa-two', shop: `First Shop ${uniq()}` });
  const second = await addBusiness(owner, { shop: `Second Shop ${uniq()}`, stateCode: '29' });
  return { ...owner, second };
}

/**
 * A staff member whose ACTIVE business is their employer's unfinished one, and
 * who owns a safe (owner-only, no books) unfinished business of their own.
 */
export async function staffOfUnfinishedEmployer() {
  const employer = await newUser({ prefix: 'qa-emp', name: 'Employer' });
  const empShop = await addBusiness(employer, { shop: `Employer Unfinished ${uniq()}`, done: false });
  const staffEmail = `qa-staff-${uniq()}@e2e.test`;
  const made = await must('POST', '/members', { full_name: 'Corner Staff', email: staffEmail, role: 'staff' }, employer.token);
  let token = (await must('POST', '/auth/login', { email: staffEmail, password: made.password })).access_token;
  await must('POST', '/auth/password/set', { current_password: made.password, new_password: PASSWORD }, token);
  token = (await must('POST', '/auth/login', { email: staffEmail, password: PASSWORD })).access_token;
  const staff = { email: staffEmail, password: PASSWORD, token };
  const own = await addBusiness(staff, { shop: `Corner Own ${uniq()}`, done: false });
  await must('POST', '/auth/switch-tenant', { tenant_id: empShop.id }, staff.token);
  return { ...staff, employerTenant: empShop, ownTenant: own };
}

/** A national mobile number held by some other login (for the "taken mobile" checks). */
export async function takenMobile() {
  const mobile = uniqMobile();
  await newUser({ prefix: 'qa-taken', name: 'Mobile Holder', mobile });
  return mobile;
}

/** Owner for defects2-sweep: a "Ramesh L …" party with a statement to render. */
export async function sweepOwner() {
  const owner = await newOwner({ prefix: 'qa-sweep' });
  await must('PATCH', '/tenants/current', { phone: '9876543210', address: { line1: '12 Station Road', city: 'Nashik', pincode: '422001', state_code: '27' } }, owner.token);
  await addParty(owner.token, { name: `Ramesh L ${uniq().slice(-4)}`, mobile: uniqMobile(), opening_balance_amount: '2300.00', opening_balance_direction: 'debit', opening_balance_as_of: daysAgo(30) });
  return owner;
}
