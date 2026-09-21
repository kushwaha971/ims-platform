#!/usr/bin/env node
/**
 * e2e/security.mjs — permission and route enforcement, checked on BOTH tiers.
 *
 * The brief this answers, in the owner's words: "Do not validate permissions
 * only by hiding frontend controls. Attempt unauthorized API operations and
 * direct-route access to confirm that the backend and frontend both enforce the
 * rules."
 *
 * So every case here is asserted twice where it can be: once by driving a
 * browser to the URL, and once by calling the API directly with no session and
 * no browser to be redirected. A guard that only exists in the client is not a
 * guard, and this is the file that would notice.
 */
import { chromium } from 'playwright';

const FRONTEND = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND ?? 'http://localhost:8000/api/v1';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

/** A direct API call with no cookies and no browser — nothing to redirect. */
async function api(method, path, body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'api',
      'X-Request-Id': crypto.randomUUID().replace(/-/g, ''),
      ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* empty body is fine */ }
  return { status: res.status, code: payload?.error?.code ?? null };
}

async function run() {
  // ── The server, with no session at all ──────────────────────────────────
  {
    const r = await api('POST', '/tenants', { name: 'Intruder Co', business_type: 'retail', state_code: '27' });
    check('POST /tenants unauthenticated is refused', r.status === 401,
      `${r.status} ${r.code ?? ''}`);

    const p = await api('GET', '/parties');
    check('GET /parties unauthenticated is refused', p.status === 401, `${p.status} ${p.code ?? ''}`);

    const me = await api('GET', '/auth/me');
    check('GET /auth/me unauthenticated is refused', me.status === 401, `${me.status} ${me.code ?? ''}`);

    const t = await api('PATCH', '/tenants/current', { onboarding_step: 4 });
    check('PATCH /tenants/current unauthenticated is refused', t.status === 401,
      `${t.status} ${t.code ?? ''}`);

    // Unauthenticated, this is 401 and not 405: authentication is resolved
    // before the router decides whether the method exists, which is the right
    // order — an anonymous caller learns nothing about which methods a route
    // implements. The 405-not-403 rule is an AUTHENTICATED concern and is
    // asserted where it belongs, in
    // apps/parties/tests/test_api.py::test_a_method_the_slice_does_not_implement_is_405.
    const w = await api('POST', '/parties', { name: 'X' });
    check('POST /parties unauthenticated is 401, leaking no method list', w.status === 401,
      `${w.status} ${w.code ?? ''}`);
  }

  // ── The browser, typing a protected URL directly ────────────────────────
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  for (const path of ['/onboarding/step/1', '/parties', '/dashboard', '/settings/plan', '/switch']) {
    await page.goto(FRONTEND + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    const landed = new URL(page.url()).pathname;
    check(`logged out, ${path} redirects to login`, landed === '/login',
      `landed on ${landed}`);
  }

  await ctx.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(2); });
