#!/usr/bin/env node
/**
 * e2e/a11y-sweep.mjs — the Sprint 12 accessibility regression (TSK-CHS-CI-21,
 * Part 12 §12.8, Part 23 §23.6, Part 28 §28.4.7).
 *
 * Seeds one GST business through the public API (parties, items, an invoice,
 * an estimate, a credit note, a receipt, a purchase bill, an expense), then
 * visits every MVP screen at phone 390 and desktop 1280 and asserts, per
 * screen:
 *
 *   axe     axe-core (the copy eslint-plugin-jsx-a11y already brings into
 *           frontend/node_modules — nothing is installed for this) over
 *           WCAG 2.0/2.1/2.2 A+AA: zero CRITICAL and zero SERIOUS violations.
 *           When axe-core is not on disk the DOM checks below still run and
 *           the report says axe was skipped.
 *   names   every visible button / link / tab / form control has an
 *           accessible name (a DOM re-statement of axe's button-name,
 *           link-name and label, so it still guards without axe).
 *   landmarks  exactly one <main>, a banner or nav on app screens, exactly
 *           one <h1>, and no heading level skipped by more than one.
 *   tables  every <table> has header cells.
 *   targets (phone only) every visible button, tab, checkbox, switch, chip
 *           and non-inline link has a HIT AREA of at least 44 × 44 — probed
 *           with elementFromPoint at the box's centre ±21 px, so a 32 px
 *           visual whose hit area is extended by a pseudo-element passes, and
 *           a neighbour whose hit area overlaps it fails.
 *   clip    (Hindi, phone 360) no button / tab / chip clips its Devanagari
 *           text vertically — scrollHeight against clientHeight.
 *   format  (every pass, en and hi) no wire ISO date and no ungrouped "₹2800"
 *           in the page text: rows are dd/mm/yyyy, money is en-IN grouped.
 *
 * Then three flows by keyboard only — the khata entry drawer, the invoice
 * editor and the payment drawer: every Tab stop shows a focus indicator,
 * the order of stops follows the visual order, Escape closes the overlay and
 * focus returns to the control that opened it; every dialog has a name.
 *
 *   node e2e/a11y-sweep.mjs                 # everything
 *   node e2e/a11y-sweep.mjs --only=/parties,/sales   # screens whose path starts so
 *   node e2e/a11y-sweep.mjs --viewport=phone         # one width
 *   node e2e/a11y-sweep.mjs --no-flows | --no-hi
 *
 * Output: $E2E_SHOTS_DIR (or /tmp/e2e-shots/a11y) — report.json with every
 * finding, report.md (a table per screen) and screenshots of failing screens.
 * Prints PASS/FAIL lines and "N/M checks passed" for run-regression.mjs.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, must, uniq, newUser, PASSWORD } from './lib/fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const OUT = process.env.E2E_SHOTS_DIR ?? '/tmp/e2e-shots/a11y';
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ONLY = (opt('only') ?? '').split(',').filter(Boolean);
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 860 } };
const SIZES = opt('viewport') ? [opt('viewport')] : ['phone', 'desktop'];
const FLOWS = !argv.includes('--no-flows');
const HINDI = !argv.includes('--no-hi');

const AXE_PATH = [join(HERE, '../frontend/node_modules/axe-core/axe.min.js'), join(HERE, 'node_modules/axe-core/axe.min.js')].find(existsSync);
const AXE_SRC = AXE_PATH ? readFileSync(AXE_PATH, 'utf8') : null;

const results = [];
const report = { axe: AXE_PATH ?? null, screens: [], flows: [] };
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${String(extra).slice(0, 400)}` : ''}`);
};

// ── Seed ─────────────────────────────────────────────────────────────────────
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstinFor = (seed) => {
  const letters = String(seed).slice(-5).split('').map((d) => B36[10 + Number(d)]).join('');
  const body = `27${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => { const p = B36.indexOf(ch) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); });
  return body + B36[(36 - (sum % 36)) % 36];
};
const iso = (n = 0) => new Date(Date.now() + 5.5 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);

async function seed() {
  const email = `a11y-${uniq()}@e2e.test`;
  let tok = (await must('POST', '/auth/register', { email, password: PASSWORD, full_name: 'Access Owner' })).access_token;
  const ten = await must('POST', '/tenants', { name: 'Sulabh Kirana Stores', business_type: 'retail', state_code: '27' }, tok);
  tok = ten.access_token ?? tok;
  for (const step of [2, 3, 4]) await must('PATCH', '/tenants/current', { onboarding_step: step }, tok);
  await must('PATCH', '/tenants/current', { gst_type: 'regular', gstin: gstinFor(Date.now()), address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } }, tok);
  const units = await must('GET', '/units', null, tok);
  const nos = units.find((u) => u.code === 'NOS') ?? units[0];
  const item = (name, price, tax, hsn, stock, reorder) => must('POST', '/items', {
    name, unit_id: nos.id, selling_price: price, purchase_price: '300.00', tax_code: tax, hsn_sac: hsn,
    reorder_point: reorder, opening_stock: { qty: stock, unit_cost: '300.00' },
  }, tok);
  const rice = await item('Basmati Rice 5kg', '450.00', 'GST5', '1006', '40', '5');
  const soap = await item('Detergent 1kg', '95.00', 'GST18', '3402', '60', '5');
  await item('Toor Dal 1kg', '140.00', 'GST5', '0713', '3', '10');
  const ramesh = await must('POST', '/parties', { name: 'Ramesh Traders', is_customer: true, state_code: '27', mobile: '+919876543210', opening_balance_amount: '1250.00', opening_balance_direction: 'debit', opening_balance_as_of: iso(40) }, tok);
  const supp = await must('POST', '/parties', { name: 'Shree Wholesale', is_supplier: true, is_customer: false, state_code: '27' }, tok);
  const inv = await must('POST', '/sales/invoices?issue=true', { party_id: ramesh.id, document_date: iso(0), due_on: iso(0), lines: [{ item_id: rice.id, qty: '2' }, { item_id: soap.id, qty: '2' }] }, tok);
  const est = await api('POST', '/sales/estimates', { party_id: ramesh.id, document_date: iso(0), lines: [{ item_id: rice.id, qty: '1' }] }, tok);
  const cnLine = inv.lines.find((l) => l.item_id === soap.id)?.id;
  let cn = await api('POST', '/sales/credit-notes', { against_id: inv.id, party_id: ramesh.id, document_date: iso(0), reason: 'sales_return', restock: true, lines: [{ item_id: soap.id, qty: '1', against_line_id: cnLine }] }, tok);
  if (cn.body?.data) cn = await api('POST', `/sales/credit-notes/${cn.body.data.id}/issue`, {}, tok);
  const pay = await api('POST', '/payments', { direction: 'in', party_id: ramesh.id, payment_date: iso(0), amount: '500.00', mode_breakup: [{ mode: 'cash', amount: '500.00' }], note: 'Part payment' }, tok);
  const cats = await must('GET', '/expense-categories', null, tok);
  await api('POST', '/expenses', { amount: '150', category_id: cats[0].id, expense_date: iso(0), mode: 'cash', note: 'Tea and snacks' }, tok);
  const bill = await api('POST', '/purchases/bills?record=true', { party_id: supp.id, supplier_invoice_number: `SW-${Date.now() % 10000}`, supplier_invoice_date: iso(0), document_date: iso(0), due_on: iso(-20), lines: [{ item_id: rice.id, qty: '10', unit_cost: '300.00', tax_code: 'GST5' }] }, tok);
  const fresh = await newUser({ prefix: 'a11y-onb', name: 'New Merchant' });
  return {
    email, fresh: fresh.email,
    ids: { party: ramesh.id, item: rice.id, invoice: inv.id, estimate: est.body?.data?.id, cn: cn.body?.data?.id, payment: pay.body?.data?.id, bill: bill.body?.data?.id },
  };
}

// ── Screens ──────────────────────────────────────────────────────────────────
const screens = (ids) => [
  '/dashboard', '/parties', '/parties/tags', `/parties/${ids.party}`, `/parties/${ids.party}/statement`,
  '/ledger/aging', '/ledger/reminders',
  '/items', '/items/masters', `/items/${ids.item}`, '/stock/low', '/stock/summary',
  '/expenses', '/cashbook',
  '/sales/invoices', '/sales/invoices/new', `/sales/invoices/${ids.invoice}`,
  '/sales/estimates', '/sales/estimates/new', ids.estimate && `/sales/estimates/${ids.estimate}`,
  '/sales/credit-notes', ids.cn && `/sales/credit-notes/${ids.cn}`,
  '/payments', ids.payment && `/payments/${ids.payment}`,
  '/purchases/bills', '/purchases/bills/new', ids.bill && `/purchases/bills/${ids.bill}`,
  '/imports',
  '/reports', '/reports/day-book', '/reports/sales-register', '/reports/purchase-register', '/reports/gst-summary',
  '/settings', '/settings/profile', '/settings/branding', '/settings/activity', '/settings/devices', '/settings/data', '/settings/plan', '/settings/team',
  '/switch',
].filter(Boolean);
const PUBLIC = ['/login', '/signup'];
const pick = (list) => (ONLY.length ? list.filter((p) => ONLY.some((o) => p.startsWith(o))) : list);

// ── The in-page audit ────────────────────────────────────────────────────────
/** Runs in the page. Everything but axe; returns plain data. */
function domAudit({ phone, hindi }) {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01 && !e.closest('[aria-hidden="true"],[inert]');
  };
  const label = (e) => {
    const by = e.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    const a = e.getAttribute('aria-label');
    if (a && a.trim()) return a.trim();
    if (e.labels && e.labels.length) return [...e.labels].map((l) => l.textContent).join(' ').trim();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)) return (e.getAttribute('title') || '').trim();
    const t = (e.innerText || e.textContent || '').trim();
    if (t) return t;
    const img = e.querySelector('img[alt]');
    if (img && img.alt.trim()) return img.alt.trim();
    const svgTitle = e.querySelector('svg title');
    if (svgTitle) return svgTitle.textContent.trim();
    return (e.getAttribute('title') || '').trim();
  };
  const describe = (e) => {
    const id = e.id ? `#${e.id}` : '';
    const tid = e.getAttribute('data-testid') ? `[data-testid=${e.getAttribute('data-testid')}]` : '';
    const role = e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : '';
    const text = (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${e.tagName.toLowerCase()}${id}${tid}${role}${text ? ` "${text}"` : ''}`;
  };
  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=radio], [role=combobox], [role=menuitem], [role=option], [role=slider]';
  const controls = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  const unnamed = controls.filter((e) => !label(e)).map(describe);

  const mains = document.querySelectorAll('main, [role=main]').length;
  const navs = document.querySelectorAll('nav, [role=navigation], header, [role=banner]').length;
  const h1 = [...document.querySelectorAll('h1')].filter(visible).map((e) => e.innerText.trim());
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter(visible)
    .map((e) => ({ l: e.getAttribute('aria-level') ? Number(e.getAttribute('aria-level')) : Number(e.tagName[1]) || 2, t: e.innerText.trim().slice(0, 40) }));
  const skips = [];
  for (let i = 1; i < levels.length; i += 1) if (levels[i].l - levels[i - 1].l > 1) skips.push(`h${levels[i - 1].l} "${levels[i - 1].t}" → h${levels[i].l} "${levels[i].t}"`);
  const tables = [...document.querySelectorAll('table')].filter(visible)
    .filter((t) => !t.querySelector('th, [role=columnheader], [role=rowheader]')).map((t) => t.getAttribute('aria-label') || t.id || 'table');

  const targets = [];
  if (phone) {
    const TARGET = 'button, [role=button], [role=tab], [role=checkbox], [role=switch], [role=radio], [role=menuitem], input[type=checkbox], input[type=radio], a[href]';
    const cands = [...document.querySelectorAll(TARGET)].filter(visible).filter((e) => {
      // R-A-3's 44 px is for ACTIONS: buttons, tabs, chips, switches, boxes,
      // and links dressed as buttons (`.ub-hit`). An underlined TEXT link — a
      // document number in a khata row, a name in a dashboard list — is held
      // to WCAG 2.5.8's 24 px-or-spacing floor instead, which axe's
      // target-size rule asserts on every screen above.
      if (e.tagName === 'A' && !e.classList.contains('ub-hit') && !e.getAttribute('role')) {
        const s = getComputedStyle(e);
        if (/underline/.test(s.textDecorationLine)) return false;
        if (s.display === 'inline' && e.parentElement && (e.parentElement.innerText || '').trim().length > (e.innerText || '').trim().length + 4) return false;
      }
      // A native checkbox visually replaced by its styled label is probed via the label.
      if (e.tagName === 'INPUT' && getComputedStyle(e).opacity === '0') return false;
      return true;
    });
    const sx = window.scrollX; const sy = window.scrollY;
    for (const e of cands) {
      const r0 = e.getBoundingClientRect();
      if (r0.width >= 44 && r0.height >= 44) continue;
      e.scrollIntoView({ block: 'center', inline: 'center' });
      const r = e.getBoundingClientRect();
      const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
      const hits = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h) || (e.labels && [...e.labels].some((l) => l === h || l.contains(h)))); };
      if (!hits(cx, cy)) continue; // occluded by a sticky bar at this scroll: not measurable here
      // Some 44 × 44 square that contains the control must be hittable edge to
      // edge — centred on it, or flush with either side (a switch at the end of
      // a row whose label is the rest of the row is a 44-high target that
      // extends LEFT, not both ways).
      const w = Math.min(r.width, 44); const h = Math.min(r.height, 44);
      const xs = [...new Set([r.left - (44 - w) / 2, r.left - (44 - w), r.left])];
      const ys = [...new Set([r.top - (44 - h) / 2, r.top - (44 - h), r.top])];
      let best = null;
      for (const x0 of xs) for (const y0 of ys) {
        const p = { l: hits(x0 + 1, y0 + 22), r: hits(x0 + 43, y0 + 22), t: hits(x0 + 22, y0 + 1), b: hits(x0 + 22, y0 + 43) };
        const miss = Object.entries(p).filter(([, v]) => !v).map(([k]) => k).join('');
        if (best === null || miss.length < best.length) best = miss;
        if (!miss) break;
      }
      if (best) targets.push(`${describe(e)} ${Math.round(r.width)}×${Math.round(r.height)} (hit area short on ${best})`);
    }
    window.scrollTo(sx, sy);
  }

  const clipped = [];
  if (hindi) {
    const cands = [...document.querySelectorAll('button, [role=tab], [role=button], [role=radio], [role=checkbox], a[href], label, th')].filter(visible);
    for (const e of cands) {
      const t = (e.innerText || '').trim();
      if (!/[ऀ-ॿ]/.test(t)) continue;
      for (const n of [e, ...e.querySelectorAll('*')]) {
        if (!(n.innerText || '').trim()) continue;
        // `sr-only` text is a 1 × 1 clipped box ON PURPOSE (an icon-only
        // button's name, the skip link at rest): not a visual clip.
        if (n.clientHeight <= 2 || n.clientWidth <= 2) continue;
        const s = getComputedStyle(n);
        const clips = s.overflowY === 'hidden' || s.overflow === 'hidden' || s.overflowY === 'clip' || /-webkit-box/.test(s.display);
        if (clips && n.scrollHeight > n.clientHeight + 1) { clipped.push(`${describe(e)} (${n.scrollHeight}>${n.clientHeight})`); break; }
        const lh = parseFloat(s.lineHeight); const fs = parseFloat(s.fontSize);
        if (clips && lh && fs && lh / fs < 1.3) { clipped.push(`${describe(e)} (line-height ${lh}/${fs})`); break; }
      }
    }
  }
  // i18n (TSK-CHS-I18N-09): rows print dd/mm/yyyy and money groups the
  // Indian way in both locales — a wire ISO date or "₹2800.00" on screen is
  // a raw value that skipped its formatter.
  const text = document.body.innerText;
  const isoDates = [...new Set(text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? [])];
  const ungrouped = [...new Set(text.match(/₹\s?\d{4,}(?:\.\d+)?/g) ?? [])];
  return {
    unnamed, mains, navs, h1, skips, tables, targets, clipped, isoDates, ungrouped,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
}

async function runAxe(page) {
  if (!AXE_SRC) return null;
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE_SRC });
  return page.evaluate(async () => {
    // The DRAFT / VOID watermark on a document preview is incidental text by
    // WCAG 1.4.3's own exception: a 10 % grey mark behind the sheet, aria-
    // hidden, whose meaning the status badge and the page header both state.
    const r = await window.axe.run({ exclude: [['[data-testid="print-watermark"]']] }, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, tags: v.tags.filter((t) => t.startsWith('wcag') || t === 'best-practice'), help: v.help,
      nodes: v.nodes.slice(0, 8).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 180), summary: (n.failureSummary || '').slice(0, 240) })),
      count: v.nodes.length,
    }));
  });
}

const settle = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch { /* long-poll or slow */ }
  await page.waitForTimeout(700);
};

async function signIn(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await settle(page);
  return page;
}

const slug = (p) => p.replace(/^\//, '').replace(/[^\w-]+/g, '_') || 'root';

async function auditScreen(page, path, size, { app = true, hindi = false } = {}) {
  const tag = `${size}${hindi ? '-hi' : ''} ${path}`;
  const phone = size === 'phone' || size === 'hi360';
  const dom = await page.evaluate(domAudit, { phone, hindi });
  const axe = hindi ? null : await runAxe(page);
  const blocking = (axe ?? []).filter((v) => (v.impact === 'critical' || v.impact === 'serious') && !v.tags.includes('best-practice'));
  const entry = { path, size, hindi, url: page.url(), dom, axe };
  report.screens.push(entry);
  let bad = false;
  const c = (name, ok, extra) => { check(`${tag}: ${name}`, ok, extra); if (!ok) bad = true; };
  if (!hindi) {
    if (axe) c('axe — zero critical/serious WCAG violations', blocking.length === 0, blocking.map((v) => `${v.id}×${v.count} (${v.nodes[0]?.target})`).join('; '));
    c('every control has an accessible name', dom.unnamed.length === 0, dom.unnamed.slice(0, 6).join('; '));
    c('one <main> landmark', dom.mains === 1, `${dom.mains}`);
    if (app) c('banner/nav landmark present', dom.navs > 0, `${dom.navs}`);
    c('exactly one <h1>', dom.h1.length === 1, dom.h1.join(' | '));
    c('no heading level skipped', dom.skips.length === 0, dom.skips.slice(0, 3).join('; '));
    c('every table has header cells', dom.tables.length === 0, dom.tables.join(', '));
    c('no horizontal page overflow', dom.overflow <= 1, `${dom.overflow}px`);
    if (phone) c('touch targets ≥ 44×44 hit area', dom.targets.length === 0, `${dom.targets.length}: ${dom.targets.slice(0, 5).join('; ')}`);
  } else {
    c('no Devanagari clipped in buttons/tabs/chips', dom.clipped.length === 0, dom.clipped.slice(0, 5).join('; '));
  }
  c('no raw ISO date or ungrouped ₹ amount on screen', dom.isoDates.length === 0 && dom.ungrouped.length === 0, [...dom.isoDates, ...dom.ungrouped].slice(0, 5).join('; '));
  if (bad) await page.screenshot({ path: join(OUT, `${size}${hindi ? '-hi' : ''}-${slug(path)}.png`), fullPage: true }).catch(() => {});
}

// ── Keyboard flows ───────────────────────────────────────────────────────────
/** Stamp every focusable with its resting style, so a Tab stop can be compared against it. */
const stamp = (page) => page.evaluate(() => {
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
  let i = 0;
  const snap = (e) => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join('|'); };
  window.__rest = {};
  // The control that already has focus (a drawer's autofocused amount) is
  // photographed at rest by blurring it for the snapshot and handing focus back.
  const active = document.activeElement;
  if (active && active !== document.body) active.blur();
  for (const e of document.querySelectorAll(sel)) {
    if (!e.dataset.a11yIdx) e.dataset.a11yIdx = String((i += 1) + Math.floor(Math.random() * 1e6) * 1000);
    window.__rest[e.dataset.a11yIdx] = [snap(e), e.parentElement ? snap(e.parentElement) : '', e.parentElement?.parentElement ? snap(e.parentElement.parentElement) : ''];
  }
  if (active && active !== document.body) active.focus();
});
const focusInfo = (page) => page.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const snap = (n) => { const s = getComputedStyle(n); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join('|'); };
  const rest = window.__rest?.[e.dataset.a11yIdx];
  const now = [snap(e), e.parentElement ? snap(e.parentElement) : '', e.parentElement?.parentElement ? snap(e.parentElement.parentElement) : ''];
  const s = getComputedStyle(e);
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
  const r = e.getBoundingClientRect();
  // Document coordinates, not viewport ones: Tab scrolls the page (and a
  // drawer's body), and a viewport y would read every scroll as a jump up.
  let scrollY = window.scrollY; let scrollX = window.scrollX;
  for (let a = e.parentElement; a; a = a.parentElement) { scrollY += a.scrollTop; scrollX += a.scrollLeft; }
  return {
    name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || e.name || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
    tag: e.tagName.toLowerCase(),
    visible: rest ? now.some((v, k) => v !== rest[k]) || ring : ring,
    x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height),
    inDialog: !!e.closest('[role=dialog],[role=alertdialog]'),
    firstInDialog: (() => {
      const dlg = e.closest('[role=dialog],[role=alertdialog]');
      if (!dlg) return false;
      const first = [...dlg.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')]
        .find((n) => !n.disabled && n.getClientRects().length > 0);
      return first === e;
    })(),
    inFooter: (() => {
      const dlg = e.closest('[role=dialog],[role=alertdialog]');
      if (!dlg) return false;
      let n = e;
      while (n && n.parentElement !== dlg) n = n.parentElement;
      return !!n && dlg.children.length > 1 && n === dlg.lastElementChild;
    })(),
  };
});

/**
 * Tab through `stops` stops; assert each shows a focus indicator and that the
 * sequence reads top-to-bottom, left-to-right: a stop may go UP only when it
 * also moves right into another column (≥ 120 px), never back up the same column.
 */
async function tabWalk(page, name, stops, { inDialog = false } = {}) {
  await stamp(page);
  const seq = [];
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const f = await focusInfo(page);
    if (f) seq.push(f);
  }
  const noRing = seq.filter((f) => !f.visible).map((f) => `${f.tag} "${f.name}"`);
  const jumps = [];
  const footerFlips = [];
  const phoneFooter = inDialog && (page.viewportSize()?.width ?? 1280) < 640;
  for (let i = 1; i < seq.length; i += 1) {
    const a = seq[i - 1]; const b = seq[i];
    // A focus trap wraps from the last stop back to the first: the cycle is
    // complete, and what follows repeats it.
    if (i > 1 && b.name === seq[0].name && b.tag === seq[0].tag) break;
    if (inDialog && b.firstInDialog && !a.firstInDialog) break;
    if (b.y < a.y - 24 && !(b.x > a.x + 120) && !(i === seq.length - 1 && b.y < 120)) {
      const text = `"${a.name}"(${a.x},${a.y}) → "${b.name}"(${b.x},${b.y})`;
      // KNOWN, owner's call: below `sm` MLDialogFooter stacks its actions
      // reversed (primary on top, `reversed-on-mobile`), so Tab walks a
      // phone footer bottom-up. Reported, not failed; `as-written` is the
      // one-line switch (see the Sprint 12 a11y report).
      if (phoneFooter && a.inFooter && b.inFooter) { footerFlips.push(text); continue; }
      jumps.push(text);
    }
  }
  if (footerFlips.length) console.log(`NOTE  ${name}: phone footer is reversed-on-mobile — ${footerFlips.join('; ')}`);
  const escaped = inDialog ? seq.filter((f) => !f.inDialog).map((f) => f.name) : [];
  report.flows.push({ name, seq, noRing, jumps, escaped, footerFlips });
  check(`${name}: every Tab stop shows a focus indicator`, noRing.length === 0, noRing.slice(0, 6).join('; '));
  check(`${name}: Tab order follows the visual order`, jumps.length === 0, jumps.slice(0, 4).join('; '));
  if (inDialog) check(`${name}: focus stays trapped in the dialog`, escaped.length === 0, escaped.slice(0, 4).join('; '));
  return seq;
}

/** Open an overlay with `trigger`, check it is a named dialog, Escape it, check focus came home. */
async function overlay(page, name, trigger, { walk = 12 } = {}) {
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dlg = page.locator('[role=dialog]:visible, [role=alertdialog]:visible').last();
  const opened = await dlg.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  check(`${name}: Enter on the trigger opens a dialog`, opened);
  if (!opened) return;
  await page.waitForTimeout(400);
  const meta = await dlg.evaluate((d) => {
    const by = d.getAttribute('aria-labelledby');
    const nm = d.getAttribute('aria-label') || (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '');
    return { name: nm.trim(), focusInside: d.contains(document.activeElement), modal: d.getAttribute('aria-modal') };
  });
  check(`${name}: dialog has an accessible name`, !!meta.name, meta.name);
  check(`${name}: focus moves into the dialog on open`, meta.focusInside);
  if (walk) await tabWalk(page, `${name} (Tab)`, walk, { inDialog: true });
  await page.keyboard.press('Escape');
  const closed = await dlg.waitFor({ state: 'hidden', timeout: 5000 }).then(() => true).catch(() => false);
  check(`${name}: Escape closes it`, closed);
  await page.waitForTimeout(300);
  const back = await trigger.evaluate((t) => t === document.activeElement || t.contains(document.activeElement)).catch(() => false);
  check(`${name}: focus returns to the trigger`, back);
}

/**
 * A refused form names its errors to assistive tech: every invalid control is
 * `aria-invalid` and its `aria-describedby` resolves to text that is on screen
 * (R-A-1 — UbField wires it; this proves it survives to the browser).
 */
async function formErrors(browser, size) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[size], locale: 'en-IN' });
  const page = await ctx.newPage();
  await page.goto(`${FE}/login`); await settle(page);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(800);
  const fields = await page.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].map((e) => {
    const ids = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const text = ids.map((id) => document.getElementById(id)?.innerText?.trim() ?? '').filter(Boolean).join(' | ');
    return { name: e.getAttribute('name') || e.id, text };
  }));
  check(`${size} login refused empty: invalid fields are marked aria-invalid`, fields.length > 0, JSON.stringify(fields));
  check(`${size} login refused empty: each error is described to AT`, fields.length > 0 && fields.every((f) => f.text), JSON.stringify(fields));
  // An INVALID field still shows focus: its error border must change when
  // focused, or Tab into "Enter your email" moves nothing on screen (2.4.7).
  const ring = await page.evaluate(async () => {
    const e = document.querySelector('[aria-invalid="true"]');
    if (!e) return null;
    const look = () => { const s = getComputedStyle(e); return [s.boxShadow, s.borderColor, s.outlineStyle].join('|'); };
    e.blur(); const rest = look();
    e.focus(); await new Promise((r) => setTimeout(r, 250));
    return { rest, focused: look() };
  });
  check(`${size} login refused empty: an invalid field still shows focus`, !!ring && ring.rest !== ring.focused, JSON.stringify(ring));
  await ctx.close();
}

async function flows(browser, S) {
  for (const size of SIZES) {
    await formErrors(browser, size);
    const ctx = await browser.newContext({ viewport: VIEWPORTS[size], locale: 'en-IN' });
    const page = await signIn(ctx, S.email);
    // Khata entry drawer (LED-01): the page's everyday pair.
    await page.goto(`${FE}/parties/${S.ids.party}`); await settle(page);
    await tabWalk(page, `${size} khata page`, 18);
    const gave = page.getByRole('button', { name: /^You gave/ }).first();
    if (await gave.count()) await overlay(page, `${size} khata "You gave" drawer`, gave);
    else check(`${size} khata: "You gave" button found`, false);
    // Payment drawer (PAY-01) from the payments list.
    await page.goto(`${FE}/payments`); await settle(page);
    const rec = page.getByRole('button', { name: /record|receive|payment/i }).first();
    if (await rec.count()) await overlay(page, `${size} payment drawer`, rec);
    else check(`${size} payments: record button found`, false);
    // Invoice editor (SAL-02): the page itself, top to bottom.
    await page.goto(`${FE}/sales/invoices/new`); await settle(page);
    await tabWalk(page, `${size} invoice editor`, 22);
    await ctx.close();
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────
const S = await seed();
writeFileSync(join(OUT, 'state.json'), JSON.stringify(S, null, 1));
console.log(`seeded ${S.email}; axe-core ${AXE_PATH ? `from ${AXE_PATH}` : 'NOT FOUND — DOM checks only'}`);
const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const vp = VIEWPORTS[size];
    // Public screens, signed out.
    const pub = await browser.newContext({ viewport: vp, locale: 'en-IN' });
    const pp = await pub.newPage();
    for (const path of pick(PUBLIC)) { await pp.goto(`${FE}${path}`); await settle(pp); await auditScreen(pp, path, size, { app: false }); }
    await pub.close();
    // Onboarding, as a user with no business.
    if (pick(['/onboarding']).length) {
      const oc = await browser.newContext({ viewport: vp, locale: 'en-IN' });
      const op = await signIn(oc, S.fresh);
      await auditScreen(op, new URL(op.url()).pathname, size, { app: false });
      await oc.close();
    }
    // The app.
    const ctx = await browser.newContext({ viewport: vp, locale: 'en-IN' });
    const page = await signIn(ctx, S.email);
    for (const path of pick(screens(S.ids))) {
      try {
        await page.goto(`${FE}${path}`); await settle(page);
        await auditScreen(page, path, size);
      } catch (e) { check(`${size} ${path}: audited`, false, e.message); }
    }
    await ctx.close();
  }
  if (HINDI) {
    // Devanagari at the narrowest phone the product supports.
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: 'hi-IN' });
    await ctx.addCookies([{ name: 'ub_locale', value: 'hi', url: FE }]);
    const page = await signIn(ctx, S.email);
    for (const path of pick(screens(S.ids))) {
      try { await page.goto(`${FE}${path}`); await settle(page); await auditScreen(page, path, 'hi360', { hindi: true }); } catch (e) { check(`hi360 ${path}: audited`, false, e.message); }
    }
    await ctx.close();
  }
  if (FLOWS) await flows(browser, S);
} finally {
  await browser.close();
}

// ── Report ───────────────────────────────────────────────────────────────────
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const md = ['# Accessibility sweep', '', `axe-core: ${AXE_PATH ?? 'not found (DOM checks only)'}`, ''];
for (const s of report.screens) {
  const v = (s.axe ?? []).map((x) => `${x.impact} ${x.id}×${x.count}`);
  md.push(`## ${s.size}${s.hindi ? ' (hi)' : ''} ${s.path}`, '');
  if (v.length) md.push(`- axe: ${v.join(', ')}`);
  for (const k of ['unnamed', 'skips', 'tables', 'targets', 'clipped']) if (s.dom[k]?.length) md.push(`- ${k}: ${s.dom[k].join('; ')}`);
  md.push('');
}
for (const f of report.flows) md.push(`## flow ${f.name}`, '', ...f.seq.map((x, i) => `${i + 1}. ${x.tag} "${x.name}" (${x.x},${x.y})${x.visible ? '' : ' — NO FOCUS INDICATOR'}`), '');
writeFileSync(join(OUT, 'report.md'), md.join('\n'));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed — report ${join(OUT, 'report.md')}`);
process.exit(passed === results.length ? 0 : 1);
