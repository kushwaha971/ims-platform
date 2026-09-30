/**
 * seed.mjs — demo data for the YourKhata videos, through the PUBLIC API only
 * (same patterns as repo e2e/lib/fixtures.mjs; imported read-only).
 *
 * All data is fictional: shop "Sharma General Store", customers Ramesh Traders /
 * Suresh Kumar / ..., supplier Gupta Wholesale. Phone numbers are 98000xxxxx
 * placeholders, GSTINs are checksum-valid but invented, the UPI handle ends in
 * "@example" so its QR can never pay a real person.
 *
 *   node seed.mjs background <email> <password>   → history on an existing owner
 *   node seed.mjs owner <label>                   → new owner + business + history
 *
 * Prints JSON state (ids) on stdout; the password never leaves the secrets file.
 */
import { api, must } from '/home/claude/repo/e2e/lib/fixtures.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const gstinFor = (seed, st = '27') => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `${st}${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => { const p = B36.indexOf(ch) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); });
  return body + B36[(36 - (sum % 36)) % 36];
};
/** IST calendar date n days ago. */
export const iso = (n = 0) => new Date(Date.now() + 5.5 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);

export const SECRETS = '/home/claude/video/.secrets/accounts.json';
export function saveAccount(key, acct) {
  mkdirSync('/home/claude/video/.secrets', { recursive: true, mode: 0o700 });
  const all = existsSync(SECRETS) ? JSON.parse(readFileSync(SECRETS, 'utf8')) : {};
  all[key] = acct;
  writeFileSync(SECRETS, JSON.stringify(all, null, 2), { mode: 0o600 });
}
export const loadAccount = (key) => JSON.parse(readFileSync(SECRETS, 'utf8'))[key];

/** A strong random password — typed into a MASKED field on camera, never shown or printed. */
export const randomPassword = () => `Yk${Math.random().toString(36).slice(2, 8)}${Date.now() % 1000}x!`;

export async function login(email, password) {
  return loginToken(email, password);
}
export async function loginToken(email, password) {
  return (await must('POST', '/auth/login', { email, password })).access_token;
}

export const SHOP = {
  name: 'Sharma General Store',
  owner: 'Rajesh Sharma',
  profile: (seed) => ({
    gst_type: 'regular',
    gstin: gstinFor(seed),
    upi_vpa: 'sharmastore.demo@example',
    phone: '9800000100',
    address: { line1: '14 Mahatma Phule Road', city: 'Pune', state: 'Maharashtra', pincode: '411002', state_code: '27' },
  }),
};

export const ITEMS = [
  // name, price, tax, hsn, opening qty, unit cost, reorder point
  ['Basmati Rice 5kg', '450.00', 'GST5', '1006', '40', '380.00', '5'],
  ['Toor Dal 1kg', '165.00', 'GST5', '0713', '60', '130.00', '10'],
  ['Sugar 1kg', '48.00', 'GST5', '1701', '12', '40.00', '20'], // low stock on purpose
  ['Sunflower Oil 1L', '155.00', 'GST5', '1512', '30', '128.00', '6'],
  ['Tea Powder 250g', '140.00', 'GST5', '0902', '18', '110.00', '5'],
  ['Detergent Powder 1kg', '95.00', 'GST18', '3402', '25', '72.00', '5'],
];

/**
 * History that makes the dashboard, khata, aging and reports look lived-in.
 * `skip` names parties the video will create live on camera, so they are NOT
 * seeded (e.g. skip: ['Ramesh Traders']).
 */
export async function seedBackground(token, { skip = [], items = true, profile = true } = {}) {
  const stamp = Date.now();
  // profile:false → onboarding (on camera) already set GSTIN + address; add only UPI + phone.
  const prof = SHOP.profile(stamp);
  await must('PATCH', '/tenants/current', profile ? prof : { upi_vpa: prof.upi_vpa, phone: prof.phone }, token);
  const units = await must('GET', '/units', null, token);
  const unit = (c) => (units.find((u) => u.code === c) ?? units.find((u) => u.code === 'NOS') ?? units[0]).id;
  const ids = { items: {}, parties: {} };
  if (items) {
    for (const [name, price, tax, hsn, qty, cost, reorder] of ITEMS) {
      const it = await must('POST', '/items', {
        name, item_type: 'goods', unit_id: unit('NOS'), selling_price: price, purchase_price: cost,
        tax_code: tax, hsn_sac: hsn, reorder_point: reorder, opening_stock: { qty, unit_cost: cost, as_of: iso(30) },
      }, token);
      ids.items[name] = it.id;
    }
  }
  const party = async (name, body) => {
    if (skip.includes(name)) return null;
    const p = await must('POST', '/parties', { name, is_customer: true, state_code: '27', ...body }, token);
    ids.parties[name] = p.id;
    return p;
  };
  const suresh = await party('Suresh Kumar', { mobile: '9800000102', opening_balance_amount: '1850.00', opening_balance_direction: 'debit', opening_balance_as_of: iso(48) });
  const anita = await party('Anita General Store', { mobile: '9800000103', opening_balance_amount: '4200.00', opening_balance_direction: 'debit', opening_balance_as_of: iso(75) });
  const mohan = await party('Mohan Lal', { mobile: '9800000104', opening_balance_amount: '650.00', opening_balance_direction: 'debit', opening_balance_as_of: iso(12) });
  const priya = await party('Priya Sweets', { mobile: '9800000105' });
  const ramesh = await party('Ramesh Traders', { mobile: '9800000101' });
  const gupta = await party('Gupta Wholesale', { is_customer: false, is_supplier: true, mobile: '9800000201', gstin: gstinFor(stamp + 7) });

  const entry = (p, direction, amount, days, note, mode) => p && must('POST', `/parties/${p.id}/ledger-entries`, {
    direction, amount, entry_date: iso(days), note, ...(direction === 'credit' ? { payment_mode: mode ?? 'cash' } : {}),
  }, token);
  await entry(suresh, 'debit', '720.00', 20, 'Monthly ration');
  await entry(suresh, 'credit', '1000.00', 9, 'Cash received', 'cash');
  await entry(mohan, 'debit', '380.00', 3, 'Oil and sugar');
  await entry(anita, 'credit', '1500.00', 30, 'Part payment', 'upi');
  await entry(priya, 'debit', '2400.00', 40, 'Sugar 50 kg');

  if (items) {
    const I = ids.items;
    const inv = async (body, payment) => {
      const r = await api('POST', '/sales/invoices?issue=true', { ...body, ...(payment ? { payment } : {}) }, token);
      if (r.status >= 400) throw new Error(`invoice ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      return r.body.data;
    };
    const line = (name, qty) => ({ item_id: I[name], qty: String(qty) });
    const cash = (amt, d = 0, mode = 'cash') => ({ payment_date: iso(d), mode_breakup: [{ mode, amount: String(amt) }] });
    await inv({ walk_in_name: 'Walk-in', document_date: iso(2), lines: [line('Sugar 1kg', 5), line('Tea Powder 250g', 1)] }, cash('399.00', 2));
    await inv({ walk_in_name: 'Walk-in', document_date: iso(1), lines: [line('Sunflower Oil 1L', 2)] }, cash('326.00', 1, 'upi'));
    if (suresh) await inv({ party_id: suresh.id, document_date: iso(6), due_on: iso(-9), lines: [line('Basmati Rice 5kg', 1), line('Toor Dal 1kg', 2)] }, null);
    if (priya) await inv({ party_id: priya.id, document_date: iso(4), due_on: iso(-11), lines: [line('Sugar 1kg', 4), line('Detergent Powder 1kg', 2)] }, cash('200.00', 4, 'upi'));
    // Purchase bill from the supplier, unpaid (payables + purchase register).
    if (gupta) {
      const r = await api('POST', '/purchases/bills?record=true', {
        party_id: gupta.id, supplier_invoice_number: `GW-${stamp % 10000}`, supplier_invoice_date: iso(5), document_date: iso(5), due_on: iso(-10),
        lines: [{ item_id: I['Basmati Rice 5kg'], qty: '10', unit_cost: '380.00', tax_code: 'GST5' }, { item_id: I['Toor Dal 1kg'], qty: '20', unit_cost: '130.00', tax_code: 'GST5' }],
      }, token);
      if (r.status >= 400) console.error('bill', r.status, JSON.stringify(r.body).slice(0, 300));
    }
    // Receipt against Suresh's invoice.
    if (suresh) await api('POST', '/payments', { direction: 'in', party_id: suresh.id, payment_date: iso(1), amount: '500.00', mode_breakup: [{ mode: 'upi', amount: '500.00' }], note: 'UPI received' }, token);
  }
  // Expenses: rent, electricity, tea.
  const cats = await must('GET', '/expense-categories', null, token);
  const cat = (re) => (cats.find((c) => re.test(`${c.code} ${c.name}`)) ?? cats[0]).id;
  await api('POST', '/expenses', { amount: '12000', category_id: cat(/rent/i), expense_date: iso(7), mode: 'bank', note: 'Shop rent' }, token);
  await api('POST', '/expenses', { amount: '1840', category_id: cat(/electric|utilit/i), expense_date: iso(3), mode: 'upi', note: 'Electricity bill' }, token);
  await api('POST', '/expenses', { amount: '120', category_id: cat(/food|tea|staff/i), expense_date: iso(0), mode: 'cash', note: 'Tea for staff' }, token);
  return ids;
}

/** A brand-new owner with a finished business (desktop / super-admin videos). */
export async function newDemoOwner(label, { email, shop = SHOP.name, owner = SHOP.owner } = {}) {
  const password = randomPassword();
  const addr = email ?? `rajesh.sharma.${label}.${Date.now().toString(36)}@example.com`;
  let token = (await must('POST', '/auth/register', { email: addr, password, full_name: owner })).access_token;
  const t = await must('POST', '/tenants', { name: shop, business_type: 'retail', state_code: '27' }, token);
  token = t.access_token ?? token;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, token);
  saveAccount(label, { email: addr, password, tenantId: t.tenant.id });
  return { email: addr, password, token, tenantId: t.tenant.id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === 'owner') {
    const o = await newDemoOwner(a ?? 'desktop');
    const ids = await seedBackground(o.token, { skip: (b ?? '').split(',').filter(Boolean) });
    saveAccount(a ?? 'desktop', { ...loadAccount(a ?? 'desktop'), ids });
    console.log(JSON.stringify({ email: o.email, tenantId: o.tenantId, ids }, null, 1));
  } else if (mode === 'background') {
    const acct = loadAccount(a);
    const tok = await login(acct.email, acct.password);
    const ids = await seedBackground(tok, { skip: (b ?? '').split(',').filter(Boolean) });
    saveAccount(a, { ...acct, ids });
    console.log(JSON.stringify(ids, null, 1));
  } else {
    console.error('usage: node seed.mjs owner <label> [skipCsv] | background <label> [skipCsv]');
    process.exit(2);
  }
}
