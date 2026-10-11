/**
 * e2e/demo/seed-demo.mjs — the demo book the landing page's recordings and the
 * narrated demo films are shot from.
 *
 * Everything is written through the public API, the way a merchant would make
 * it, so nothing on screen in a recording is a figure the product did not
 * compute. One owner (signed up with a mobile number and an OTP, like anybody),
 * three businesses:
 *
 *   Sharma General Store   Shop & billing   customers, suppliers, items, bills
 *   Vidya Reading Room     Library          catalogue, members, issues, returns
 *   Verma Finance          Lending          borrowers, loans, collections
 *
 * Run it against the DEMO stack only — its own database, the console OTP
 * provider (the code is read from that API's log), unreleased modules shown:
 *
 *   E2E_BACKEND=http://127.0.0.1:8100/api/v1 DEMO_API_LOG=<log> \
 *   DEMO_DB=yourkhata_demo node e2e/demo/seed-demo.mjs
 *
 * Prints one JSON line with the ids the recorders open. Names are invented and
 * the mobiles are in ranges nobody is texted from here.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { api, must } from '../lib/fixtures.mjs';
import { PYTHON } from '../lib/local.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG = process.env.DEMO_API_LOG;
const OUT = process.env.DEMO_STATE ?? path.join(REPO, 'e2e', 'demo', '.demo-state.json');
if (!LOG) throw new Error('DEMO_API_LOG is required: the demo API log the OTP is read from.');
if (!/8100/.test(process.env.E2E_BACKEND ?? '')) throw new Error('Refusing to seed anything but the demo API on :8100.');

export const OWNER = { name: 'Ramesh Sharma', mobile: '9876543210' };
const iso = (days = 0) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

const codeFor = async (mobile, from) => {
  for (let i = 0; i < 20; i += 1) {
    const log = readFileSync(LOG, 'utf8').slice(from);
    const hits = [...log.matchAll(/sms\.console to=\+91…(\d{3}) body=(\d{4,6}) is your/g)].filter((m) => m[1] === mobile.slice(-3));
    if (hits.length) return hits.at(-1)[2];
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('no OTP in the demo API log');
};

// ── The owner signs up with a mobile and a code ─────────────────────────────
const from = readFileSync(LOG, 'utf8').length;
const challenge = await must('POST', '/auth/otp/request', { mobile: OWNER.mobile });
const signedIn = await must('POST', '/auth/otp/verify', { challenge_id: challenge.challenge_id, code: await codeFor(OWNER.mobile, from) });
let tok = signedIn.access_token;

const enable = (tenantId, module) => execFileSync(PYTHON, ['manage.py', 'shell', '-c', `
from apps.platform_app.models import Tenant
t = Tenant.objects.get(id='${tenantId}')
for row, field in ((t.plan, 'modules'), (t.partner, 'allowed_modules')):
    setattr(row, field, sorted(set(getattr(row, field) or []) | {'${module}'})); row.save(update_fields=[field])
t.enabled_modules = sorted(set(t.enabled_modules or []) | {'${module}'}); t.save(update_fields=['enabled_modules'])
`], { cwd: path.join(REPO, 'backend'), env: { ...process.env, UB_UNRELEASED_MODULES: '1' } });

const business = async (name, type, extra = {}) => {
  const made = await must('POST', '/tenants', { name, business_type: type, state_code: '27', owner_name: OWNER.name }, tok);
  const token = made.access_token ?? (await must('POST', '/auth/switch-tenant', { tenant_id: made.id ?? made.tenant?.id }, tok)).access_token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, token);
  await must('PATCH', '/tenants/current', { phone: '9876543210', address: { line1: '12 Station Road', city: 'Pune', pincode: '411001', state_code: '27' }, ...extra }, token);
  const me = await must('GET', '/auth/me', null, token);
  return { id: me.active_tenant_id, token };
};

// ── 1. Shop & billing ───────────────────────────────────────────────────────
// A GSTIN with a valid check digit that belongs to nobody (the PAN part is letters from digits).
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const demoGstin = (() => {
  const body = '27AAGFS4321F1Z';
  let sum = 0;
  [...body].forEach((ch, i) => { const p = B36.indexOf(ch) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); });
  return body + B36[(36 - (sum % 36)) % 36];
})();
const shop = await business('Sharma General Store', 'retail', { upi_vpa: 'sharmastore.demo@example', gst_type: 'regular', gstin: demoGstin });
{
  const t = shop.token;
  const units = await must('GET', '/units', null, t);
  const u = (code) => units.find((x) => x.code === code)?.id ?? units[0].id;
  const item = (name, price, tax, hsn, qty, cost, reorder = '10') =>
    must('POST', '/items', { name, unit_id: u('NOS'), selling_price: price, purchase_price: cost, tax_code: tax, hsn_sac: hsn, reorder_point: reorder, opening_stock: { qty, unit_cost: cost } }, t);
  const rice = await item('Basmati Rice 5kg', '450.00', 'GST5', '1006', '40', '380.00');
  const dal = await item('Toor Dal 1kg', '165.00', 'GST5', '0713', '60', '130.00');
  const oil = await item('Mustard Oil 1L', '180.00', 'GST5', '1514', '24', '150.00');
  const sugar = await item('Sugar 1kg', '48.00', 'GST5', '1701', '100', '40.00', '20');
  const tea = await item('Tea 250g', '120.00', 'GST5', '0902', '4', '95.00');
  const soap = await item('Bath Soap', '35.00', 'GST18', '3401', '9', '24.00', '12');

  const party = (body) => must('POST', '/parties', { state_code: '27', ...body }, t);
  const ramesh = await party({ name: 'Ramesh Traders', is_customer: true, mobile: '9822012345', opening_balance_amount: '2300.00', opening_balance_direction: 'debit', opening_balance_as_of: iso(-30) });
  const anita = await party({ name: 'Anita General Store', is_customer: true, mobile: '9822012346' });
  const suresh = await party({ name: 'Suresh Kumar', is_customer: true, mobile: '9822012347' });
  const priya = await party({ name: 'Priya Sweets', is_customer: true, mobile: '9822012348' });
  await party({ name: 'Mohan Lal', is_customer: true, mobile: '9822012349' });
  const gupta = await party({ name: 'Gupta Wholesale', is_supplier: true, is_customer: false, mobile: '9822012350' });
  await party({ name: 'Agro Traders', is_supplier: true, is_customer: false, mobile: '9822012351' });

  const line = (it, qty) => ({ item_id: it.id, qty: String(qty) });
  const bill = (body, payment) => must('POST', '/sales/invoices?issue=true', { document_date: iso(0), ...body, ...(payment ? { payment } : {}) }, t);
  await bill({ party_id: ramesh.id, due_on: iso(7), document_date: iso(-6), lines: [line(rice, 2), line(dal, 3)] });
  await bill({ party_id: anita.id, due_on: iso(10), document_date: iso(-3), lines: [line(sugar, 10), line(soap, 3)] });
  await bill({ party_id: suresh.id, due_on: iso(5), document_date: iso(-2), lines: [line(oil, 4), line(tea, 2)] });
  await bill({ party_id: priya.id, due_on: iso(3), lines: [line(sugar, 25), line(oil, 2)] });
  const cashBill = await api('POST', '/sales/invoices?issue=true', { document_date: iso(0), walk_in_name: 'Walk-in customer', lines: [line(rice, 1), line(soap, 1)] }, t);
  if (cashBill.status < 400) {
    const total = cashBill.body.data.grand_total ?? cashBill.body.data.total;
    if (total) await api('POST', '/payments', { direction: 'in', document_id: cashBill.body.data.id, payment_date: iso(0), mode_breakup: [{ mode: 'cash', amount: total }] }, t);
  }
  await must('POST', `/parties/${ramesh.id}/ledger-entries`, { direction: 'credit', amount: '1500.00', entry_date: iso(-1), mode: 'upi', note: 'Part payment' }, t).catch(async () =>
    must('POST', `/parties/${ramesh.id}/ledger-entries`, { type: 'got', amount: '1500.00', entry_date: iso(-1), note: 'Part payment' }, t).catch(() => null));
  await api('POST', '/purchases/bills?record=true', { party_id: gupta.id, document_date: iso(-4), supplier_invoice_no: 'GW/1182', lines: [{ item_id: rice.id, qty: '20', unit_cost: '380.00' }, { item_id: tea.id, qty: '10', unit_cost: '95.00' }] }, t);
  const cats = await must('GET', '/expense-categories', null, t);
  const cat = (re) => (cats.find((c) => re.test(c.name)) ?? cats[0]).id;
  await api('POST', '/expenses', { amount: '8000.00', expense_date: iso(-5), category_id: cat(/rent/i), mode: 'bank', note: 'Shop rent' }, t);
  await api('POST', '/expenses', { amount: '1840.00', expense_date: iso(-2), category_id: cat(/electric|utilit/i), mode: 'upi', note: 'Electricity bill' }, t);
  await api('POST', '/expenses', { amount: '120.00', expense_date: iso(0), category_id: cat(/tea|misc|other/i), mode: 'cash', note: 'Tea and snacks' }, t);
  shop.ramesh = ramesh.id;
  shop.tea = tea.id;
}

// ── 2. Library ──────────────────────────────────────────────────────────────
const library = await business('Vidya Reading Room', 'retail');
enable(library.id, 'library');
{
  const t = library.token;
  const cat = async (name) => (await must('POST', '/library/categories', { name }, t)).id;
  const [fiction, science, exams, hindi] = [await cat('Fiction'), await cat('Science'), await cat('Competitive exams'), await cat('Hindi literature')];
  const title = (name, authors, category_id, count, price) =>
    must('POST', '/library/titles', { title: name, authors, category_id, copies: { count, price } }, t);
  const wings = await title('Wings of Fire', 'A. P. J. Abdul Kalam', science, 3, '250.00');
  const godaan = await title('Godaan', 'Munshi Premchand', hindi, 2, '180.00');
  await title('Malgudi Days', 'R. K. Narayan', fiction, 2, '220.00');
  const quant = await title('Quantitative Aptitude', 'R. S. Aggarwal', exams, 4, '650.00');
  await title('Indian Polity', 'M. Laxmikanth', exams, 3, '780.00');
  await title('The Discovery of India', 'Jawaharlal Nehru', fiction, 1, '399.00');
  await title('Concepts of Physics Vol. 1', 'H. C. Verma', science, 2, '480.00');
  await title('Nirmala', 'Munshi Premchand', hindi, 2, '150.00');

  const monthly = await must('POST', '/library/membership-types', { name: 'Monthly', fee_amount: '900.00', validity_months: 1 }, t);
  const quarterly = await must('POST', '/library/membership-types', { name: 'Quarterly', fee_amount: '2400.00', validity_months: 3 }, t);
  const member = async (name, mobile, plan, paid) => {
    const p = await must('POST', '/parties', { name, is_customer: true, mobile, state_code: '27' }, t);
    const m = await must('POST', '/library/members', { membership_type_id: plan.id, party_id: p.id, ...(paid ? { collect_fees: { mode_breakup: [{ mode: 'upi', amount: plan.fee_amount ?? paid }] } } : {}) }, t);
    return m.membership_id ?? m.id ?? m.membership?.id;
  };
  const asha = await member('Asha Kulkarni', '9820500011', monthly, '900.00');
  const rahul = await member('Rahul Sharma', '9820500012', quarterly, '2400.00');
  const imran = await member('Imran Khan', '9820500013', monthly, null);
  await member('Sneha Patil', '9820500014', monthly, '900.00');
  await member('Vikram Joshi', '9820500015', quarterly, '2400.00');

  const copies = async (ttl) => (await must('GET', `/library/copies?title=${ttl.id}`, null, t));
  const code = async (ttl, n = 0) => { const c = await copies(ttl); const row = (c.results ?? c)[n]; return row.accession_number ?? row.number ?? row.code; };
  const issue = (membership_id, c, extra = {}) => api('POST', '/library/loans', { membership_id, code: c, ...extra }, t);
  const r1 = await issue(asha, await code(wings));
  const r2 = await issue(rahul, await code(quant));
  const r3 = await issue(imran, await code(godaan));
  library.issue = [r1.status, r2.status, r3.status];
  library.freeCopy = await code(quant, 1);
  library.member = asha;
  await api('POST', '/library/shifts', { name: 'Morning', starts_at: '07:00', ends_at: '13:00' }, t);
  await api('POST', '/library/shifts', { name: 'Evening', starts_at: '14:00', ends_at: '21:00' }, t);
  await api('POST', '/library/seats/row', { prefix: 'A', from: 1, to: 12, zone: 'Reading hall' }, t);
}

// ── 3. Lending ──────────────────────────────────────────────────────────────
const lending = await business('Verma Finance', 'retail', { upi_vpa: 'vermafinance.demo@example' });
enable(lending.id, 'lending');
{
  const t = lending.token;
  const loan = (name, mobile, principal, count, per, startedDaysAgo, extra = {}) => must('POST', '/lending/loans', {
    plan_type: 'fixed_daily', principal, frequency: 'daily', instalment_count: count, per_instalment_amount: per,
    disbursed_on: iso(-startedDaysAgo), first_due_on: iso(-startedDaysAgo + 1), party: { name, mobile }, payment_mode: 'cash', ...extra,
  }, t);
  const collect = (l, amount, mode = 'cash') => must('POST', `/lending/loans/${l.id}/collections`, { amount, mode }, t);
  // Each seeded collection is LESS than what has fallen due, whichever side
  // of midnight the server's day is on, so every borrower still has something
  // to collect today and the recordings have a "Collect" to press. (A
  // collection is always dated today; one that covered the dues would leave
  // the Today list with nothing to do.)
  const geeta = await loan('Geeta Devi', '9820011223', '10000.00', 100, '100.00', 6);
  await collect(geeta, '400.00');
  const ramu = await loan('Ramu Kaka', '9820011224', '5000.00', 50, '100.00', 4);
  await collect(ramu, '200.00', 'upi');
  const salma = await loan('Salma Begum', '9820011225', '20000.00', 100, '200.00', 10);
  await collect(salma, '1600.00');
  await loan('Kishore Yadav', '9820011226', '8000.00', 80, '100.00', 2);
  const paid = await loan('Meena Tai', '9820011227', '1000.00', 10, '100.00', 9);
  await collect(paid, '1000.00');
  lending.loan = geeta.id;
}

const state = { owner: OWNER, shop: { id: shop.id, ramesh: shop.ramesh, tea: shop.tea }, library: { id: library.id, issue: library.issue, freeCopy: library.freeCopy, member: library.member }, lending: { id: lending.id, loan: lending.loan } };
writeFileSync(OUT, JSON.stringify(state, null, 2));
console.log(JSON.stringify(state));
