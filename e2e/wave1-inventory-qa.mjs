/**
 * e2e/wave1-inventory-qa.mjs — Wave 1 / T3 inventory acceptance (API + browser).
 *   node e2e/wave1-inventory-qa.mjs            # API seed + checks, then screenshots
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { newOwner, api, must, PASSWORD, uniq } from './lib/fixtures.mjs';

const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const SHOTS = '/tmp/e2e-shots/wave1/inventory';
const results = [];
const record = (id, name, ok, evidence = '') => { results.push({ id, name, ok, evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name} :: ${String(evidence).slice(0, 400)}`); };
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// ---------- API seed ----------
const o = await newOwner({ shop: 'Sharma Kirana Stores', name: 'Ramesh Sharma', prefix: 'w1-inv' });
const T = o.token;
const units = (await must('GET', '/units', null, T));
const U = Object.fromEntries(units.map((u) => [u.code, u.id]));
const catGrain = await must('POST', '/categories', { name: 'Grains & Pulses' }, T);
const catSweet = await must('POST', '/categories', { name: 'Sugar & Sweeteners' }, T);
const catSvc = await must('POST', '/categories', { name: 'Services' }, T);
const mk = (b) => api('POST', '/items', b, T);
const riceR = await mk({ name: 'Basmati Rice 5kg', item_type: 'goods', unit_id: U.BAG ?? U.PCS, category_id: catGrain.id, sku: 'RICE-BAS-5', barcode: '8901234567890', hsn_sac: '1006', tax_code: 'GST5', selling_price: '450.00', purchase_price: '380.00', mrp: '499.00', reorder_point: '10', opening_stock: { qty: '40', unit_cost: '380', as_of: daysAgo(10) } });
record('I1', 'create goods item with opening 40 @ 380', riceR.status === 201, `${riceR.status} ${JSON.stringify(riceR.body).slice(0, 300)}`);
const rice = riceR.body.data;
const dalR = await mk({ name: 'Toor Dal 1kg', item_type: 'goods', unit_id: U.PCS, category_id: catGrain.id, sku: 'DAL-TOOR-1', barcode: '8901234500011', hsn_sac: '0713', tax_code: 'GST5', selling_price: '165.00', reorder_point: '30', opening_stock: { qty: '25', unit_cost: '140', as_of: daysAgo(10) } });
const sugarR = await mk({ name: 'Sugar', item_type: 'goods', unit_id: U.KGS, category_id: catSweet.id, sku: 'SUGAR-LOOSE', hsn_sac: '1701', tax_code: 'GST5', selling_price: '48.00', reorder_point: '20', opening_stock: { qty: '50', unit_cost: '42', as_of: daysAgo(10) } });
const oilR = await mk({ name: 'Fortune Sunflower Oil 1L', item_type: 'goods', unit_id: U.BTL ?? U.PCS, category_id: catGrain.id, hsn_sac: '1512', tax_code: 'GST5', selling_price: '155.00', reorder_point: '5' });
const svcR = await mk({ name: 'Home Delivery', item_type: 'service', unit_id: U.NOS ?? U.PCS, category_id: catSvc.id, hsn_sac: '996812', tax_code: 'GST18', selling_price: '30.00' });
record('I2', 'create service item (no stock)', svcR.status === 201 && svcR.body.data.track_stock === false, `${svcR.status} track_stock=${svcR.body.data?.track_stock}`);
const svcStock = await mk({ name: 'Packing Service', item_type: 'service', unit_id: U.PCS, tax_code: 'GST18', opening_stock: { qty: '5', unit_cost: '1', as_of: today } });
record('I3', 'service + opening stock refused', svcStock.status === 400, `${svcStock.status} ${JSON.stringify(svcStock.body).slice(0, 200)}`);
const dal = dalR.body.data, sugar = sugarR.body.data, svc = svcR.body.data, oil = oilR.body.data;

const detail = async (id) => (await api('GET', `/items/${id}`, null, T)).body.data;
const adj = (lines, extra = {}) => api('POST', '/stock-adjustments', { adjustment_date: today, reason: 'damage', note: 'Rats got into the sack', lines, ...extra }, T);

let d = await detail(rice.id);
console.log('rice detail keys', Object.keys(d), JSON.stringify(d).slice(0, 900));
const a1 = await adj([{ item_id: rice.id, qty: '-2' }]);
d = await detail(rice.id);
const onHand = (x) => x.on_hand ?? x.stock?.on_hand ?? x.qty_on_hand;
record('A1', 'adjust −2 damage → on-hand 38', a1.status === 201 && Number(onHand(d)) === 38, `${a1.status} on_hand=${onHand(d)}`);
const a2 = await adj([{ item_id: rice.id, qty: '-40' }]);
record('A2', 'adjust −40 → 409 insufficient_stock with per-line detail', a2.status === 409 && a2.body.error?.code === 'insufficient_stock', `${a2.status} ${JSON.stringify(a2.body).slice(0, 400)}`);
// Weighted average: +10 @ 400 by count difference.
const a3 = await adj([{ item_id: rice.id, qty: '10', unit_cost: '400' }], { reason: 'count', note: '' });
d = await detail(rice.id);
console.log('after +10@400', JSON.stringify(d).slice(0, 900));
// Backdated: -1 dated 12 days ago? must be after opening (10 days ago) — use 5 days ago (latest is today).
const a4 = await adj([{ item_id: rice.id, qty: '-1' }], { adjustment_date: daysAgo(5), reason: 'personal_use', note: '' });
record('A4', 'backdated adjustment accepted', a4.status === 201, `${a4.status} ${JSON.stringify(a4.body).slice(0, 200)}`);
d = await detail(rice.id);
const mv = await api('GET', `/items/${rice.id}/movements`, null, T);
console.log('movements', JSON.stringify(mv.body).slice(0, 1500));
// Low stock crossing on Sugar (reorder 20, 50 on hand): −31 → 19 (cross), −1 → 18 (no second alert)
const s1 = await adj([{ item_id: sugar.id, qty: '-31' }], { reason: 'count', note: '' });
const s2 = await adj([{ item_id: sugar.id, qty: '-1' }], { reason: 'count', note: '' });
const low = await api('GET', '/stock/low', null, T);
console.log('low', s1.status, s2.status, JSON.stringify(low.body).slice(0, 1200));
const notif = await api('GET', '/notifications', null, T);
console.log('notif', notif.status, JSON.stringify(notif.body).slice(0, 1500));
const sum = await api('GET', '/stock/summary', null, T);
console.log('summary', JSON.stringify(sum.body).slice(0, 1500));
const sumAsOf = await api('GET', `/stock/summary?as_of=${daysAgo(7)}`, null, T);
console.log('summary as_of', JSON.stringify(sumAsOf.body).slice(0, 1200));
const lk = await api('GET', '/items/lookup?barcode=8901234567890', null, T);
const lk2 = await api('GET', '/items/lookup?barcode=8900000000001', null, T);
console.log('lookup', lk.status, JSON.stringify(lk.body).slice(0, 200), lk2.status, JSON.stringify(lk2.body).slice(0, 200));
for (const q of ['basmati', 'RICE-BAS', '8901234567890']) { const r = await api('GET', `/items?q=${q}`, null, T); console.log('search', q, r.body.data?.map((x) => x.name)); }
// Staff without reports.financial.read
const staffEmail = `w1-staff-${uniq()}@e2e.test`;
const made = await must('POST', '/members', { full_name: 'Counter Staff', email: staffEmail, role: 'staff' }, T);
let st = (await must('POST', '/auth/login', { email: staffEmail, password: made.password })).access_token;
await must('POST', '/auth/password/set', { current_password: made.password, new_password: PASSWORD }, st);
st = (await must('POST', '/auth/login', { email: staffEmail, password: PASSWORD })).access_token;
const ssum = await api('GET', '/stock/summary', null, st);
console.log('staff summary', ssum.status, JSON.stringify(ssum.body).slice(0, 900));
const sdet = await api('GET', `/items/${rice.id}`, null, st);
console.log('staff item', sdet.status, JSON.stringify(sdet.body).slice(0, 600));
writeFileSync('/tmp/claude-0/-home-claude/ccd972a2-3630-5714-9e07-7e6fe0fd6981/scratchpad/inv-state.json', JSON.stringify({ owner: o.email, staff: staffEmail, rice: rice.id, dal: dal.id, sugar: sugar.id, svc: svc.id, oil: oil?.id }, null, 2));
