/**
 * wave-a-qa.mjs — the Wave A gate's look-and-measure sweep (30 Sep 2026).
 *
 * The Wave A screens a merchant cannot reach yet without a module: the khata's deposit panel,
 * the statement's deposit block and the slip; Apply to bills; the void dialog that asks the
 * issuing module first, the origin badge and a value credit note; the write-off capped at the
 * trade figure; the Settings refusal banner, Business days and reminder hours; the team role
 * picker. Each screen at 390 and 1280 px, in English and Hindi, light and dark, into
 * $E2E_SHOTS/wave-a (default /tmp/e2e-shots/wave-a).
 *
 * It MEASURES rather than reads (CLAUDE.md): the page's `scrollWidth` against the viewport, and
 * every leaf text node against its own box, because an accessible name is the whole string
 * whatever the pixels do. Every message id the screen shows raw is a failure too.
 *
 * Needs the API started with the look-only stand-ins (`e2e/qa_standins/`, which register an
 * origin listener, a calendar reader and a reminder policy through the public seams), because no
 * module that uses them is released:
 *
 *   cd backend && PYTHONPATH=../e2e DJANGO_SETTINGS_MODULE=qa_settings UB_E2E_RELAX_THROTTLES=1 \
 *     setsid nohup python manage.py runserver 0.0.0.0:8000 --noreload &
 *   node e2e/wave-a-qa.mjs
 *
 * The records only a module can write (a port invoice, a value credit note, a held deposit, a
 * loan line) are seeded by `e2e/wave-a-seed.py` through the same services a module will call.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { must, newOwner, PASSWORD } from './lib/fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FE = process.env.E2E_FRONTEND ?? 'http://localhost:3000';
const SHOTS = `${process.env.E2E_SHOTS ?? '/tmp/e2e-shots'}/wave-a`;
mkdirSync(SHOTS, { recursive: true });

// ── Copy, in both languages, so a control is found by the words a merchant reads ───────────
const catalogue = (lang) => {
  const dir = path.join(REPO, 'frontend/locales/catalogues');
  const all = JSON.parse(readFileSync(path.join(REPO, `frontend/locales/${lang}.json`), 'utf8'));
  for (const f of readdirSync(dir)) if (f.endsWith(`.${lang}.json`)) Object.assign(all, JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  return all;
};
const COPY = { en: catalogue('en'), hi: catalogue('hi') };
const t = (lang, key) => {
  const s = COPY[lang][key];
  if (!s) throw new Error(`no copy for ${key}`);
  return s;
};
/** The copy as a pattern, each `{placeholder}` a wildcard: "Write off ₹{amount}" in any language
    (a prefix is not enough — Hindi puts the amount FIRST, "₹{amount} बट्टे खाते में डालें"). */
const pattern = (lang, key) =>
  new RegExp(t(lang, key).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '.*'));
const stem = pattern;

const results = [];
const record = (check, ok, detail = '') => {
  results.push({ check, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check}${detail ? `\n        ${detail}` : ''}`);
};

// ── Seed ────────────────────────────────────────────────────────────────────────────────
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
  const owner = await newOwner({ shop: 'Saraswati Library & Stores', name: 'Meera Joshi', prefix: 'wave-a' });
  const tok = owner.token;
  await must('PATCH', '/tenants/current', { gst_type: 'regular', gstin: gstinFor(Date.now()), address: { line1: '12 Market Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' } }, tok);
  const asha = await must('POST', '/parties', { name: 'Asha Rao', is_customer: true, state_code: '27', mobile: '+919812345670' }, tok);
  await must('POST', '/ledger-entries', { party_id: asha.id, direction: 'debit', amount: '650.00', entry_date: iso(12), note: 'Notebooks and pens' }, tok);
  await must('POST', '/ledger-entries', { party_id: asha.id, direction: 'credit', amount: '200.00', entry_date: iso(6), payment_mode: 'cash' }, tok);
  // An advance with no open bill to take it: it stays unapplied until Apply to bills.
  const advance = await must('POST', '/payments', { direction: 'in', party_id: asha.id, payment_date: iso(1), amount: '1000.00', mode_breakup: [{ mode: 'upi', amount: '1000.00' }], note: 'Advance for the quarter' }, tok);
  await must('POST', '/parties', { name: 'Vikram Loans', is_customer: true, state_code: '27', opening_balance_amount: '300.00', opening_balance_direction: 'debit', opening_balance_as_of: iso(40) }, tok);
  const out = execFileSync('python3', ['backend/manage.py', 'shell', '-c', "exec(open('e2e/wave-a-seed.py').read())"], {
    cwd: REPO,
    env: { ...process.env, QA_OWNER: owner.email, PYTHONPATH: path.join(REPO, 'e2e'), DJANGO_SETTINGS_MODULE: 'qa_settings' },
  }).toString();
  const line = out.split('\n').find((l) => l.startsWith('SEED '));
  if (!line) throw new Error(`seed printed no ids:\n${out.slice(-800)}`);
  return { owner, ids: { ...JSON.parse(line.slice(5)), advance: advance.id } };
}

// ── Measuring ───────────────────────────────────────────────────────────────────────────
const measure = (page) => page.evaluate(() => {
  const iw = window.innerWidth;
  const overflow = document.documentElement.scrollWidth - iw;
  const clipped = [];
  const rawIds = [];
  const roots = [...document.querySelectorAll('main, [role="dialog"], [role="alertdialog"]')];
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only') || cs.clipPath.includes('inset(50%')) continue;
    const scroller = el.closest('[class*="overflow-x-auto"], [class*="overflow-auto"]');
    const text = el.textContent.trim();
    if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible' && !scroller) clipped.push(text.slice(0, 40));
    if ((cs.webkitLineClamp && cs.webkitLineClamp !== 'none') || cs.overflowY === 'hidden') {
      if (el.scrollHeight > el.clientHeight + 2) clipped.push(`V:${text.slice(0, 40)}`);
    }
    if (r.right > iw + 1 && !scroller && !el.closest('.ub-print-sheet')) clipped.push(`OFFSCREEN:${text.slice(0, 30)}@${Math.round(r.right)}`);
    if (/^[a-z][a-zA-Z]+(\.[a-zA-Z0-9_]+){2,}$/.test(text)) rawIds.push(text);
  }
  return { overflow, clipped: [...new Set(clipped)].slice(0, 6), rawIds: [...new Set(rawIds)].slice(0, 6) };
});

async function look(page, tag, name) {
  await page.waitForTimeout(700);
  const m = await measure(page);
  await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png`, fullPage: true });
  record(`${tag} ${name}: no horizontal overflow`, m.overflow <= 1, `${m.overflow}px`);
  record(`${tag} ${name}: no text clipped or off screen`, m.clipped.length === 0, m.clipped.join(' | '));
  record(`${tag} ${name}: no raw message id`, m.rawIds.length === 0, m.rawIds.join(' | '));
  // A dialog scrolls inside itself, which a full-page shot cannot see: shoot its end too.
  const scrolled = await page.evaluate(() => {
    let moved = false;
    for (const box of document.querySelectorAll('[role="dialog"], [role="dialog"] *, [role="alertdialog"], [role="alertdialog"] *')) {
      if (box.scrollHeight > box.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(box).overflowY)) {
        box.scrollTop = box.scrollHeight;
        moved = true;
      }
    }
    return moved;
  });
  if (scrolled) {
    await page.waitForTimeout(300);
    const end = await measure(page);
    await page.screenshot({ path: `${SHOTS}/${tag}-${name}-end.png` });
    record(`${tag} ${name} (scrolled): no text clipped or off screen`, end.clipped.length === 0, end.clipped.join(' | '));
    record(`${tag} ${name} (scrolled): no raw message id`, end.rawIds.length === 0, end.rawIds.join(' | '));
  }
  return m;
}

const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
};
const go = async (page, p) => {
  await page.goto(`${FE}${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
};
const closeDialog = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
};

// ── The sweep ───────────────────────────────────────────────────────────────────────────
const { owner, ids } = await seed();
writeFileSync(`${SHOTS}/seed.json`, JSON.stringify({ email: owner.email, ids }, null, 1));
console.log(`seeded ${owner.email}`, ids);

const browser = await chromium.launch();
// `WAVE_A_LANGS=hi` re-runs one language (the seed is fresh either way).
for (const lang of (process.env.WAVE_A_LANGS ?? 'en,hi').split(',')) {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${lang}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 } });
      await ctx.addCookies([
        { name: 'ub_locale', value: lang, url: FE },
        { name: 'ub_theme_choice', value: theme, url: FE },
      ]);
      const page = await ctx.newPage();
      await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(1200); // hydration: a click before it submits the form natively
      await page.fill('input[type="email"]', owner.email);
      await page.fill('input[type="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
      await settle(page);

      // Ledger: the khata with deposit rows, the panel, the slip, a correction.
      await go(page, `/parties/${ids.asha}`);
      await look(page, tag, 'khata-deposit');
      const panelHeld = await page.getByText(t(lang, 'payments.deposit.panel.title'), { exact: true }).count();
      record(`${tag} khata shows the Deposits panel`, panelHeld > 0);
      await page.getByRole('button', { name: t(lang, 'payments.deposit.refund.action') }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await look(page, tag, 'deposit-return-drawer');
      await closeDialog(page);
      // The slip lives only while `window.print()` runs (a body portal the khata unmounts after
      // it returns), and headless print() returns at once: keep a copy of it to photograph.
      await page.evaluate(() => {
        window.print = () => {
          const slip = document.querySelector('.ub-print-slip');
          if (slip) document.body.appendChild(slip.cloneNode(true));
        };
      });
      await page.getByRole('button', { name: t(lang, 'payments.deposit.slip.action') }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      const kept = await page.evaluate(() => {
        document.body.setAttribute('data-printing-slip', '');
        return document.querySelectorAll('body > .ub-print-slip').length;
      });
      record(`${tag} the deposit slip renders for print`, kept > 0);
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: `${SHOTS}/${tag}-deposit-slip-print.png`, fullPage: true });
      await page.emulateMedia({ media: 'screen' });
      await go(page, `/parties/${ids.asha}`);
      const rowMenu = page.getByRole('button', { name: new RegExp(stem(lang, 'ledger.correction.rowActions')) }).first();
      if (await rowMenu.count()) {
        await rowMenu.click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: t(lang, 'ledger.correction.action.correct') }).first().click().catch(() => {});
        await page.waitForTimeout(1500);
        await look(page, tag, 'correction-drawer');
        await closeDialog(page);
      } else record(`${tag} a timeline row offers its ⋯ menu`, false);

      // Ledger: the statement with the deposit block, on screen and printed.
      await go(page, `/parties/${ids.asha}/statement`);
      await look(page, tag, 'statement-deposit');
      record(`${tag} statement shows the Deposit held block`, (await page.getByText(t(lang, 'ledger.statement.deposit.title')).count()) > 0);
      await page.emulateMedia({ media: 'print' });
      await page.screenshot({ path: `${SHOTS}/${tag}-statement-print.png`, fullPage: true });
      await page.emulateMedia({ media: 'screen' });

      // Ledger: write-off offered at the trade figure (₹300), never the loan's ₹2,300.
      await go(page, `/parties/${ids.loanParty}`);
      await look(page, tag, 'khata-loan');
      const menu = page.getByRole('button', { name: t(lang, 'parties.detail.moreActions') }).first();
      await page.getByRole('button', { name: t(lang, 'parties.archive.action') }).first().click({ timeout: 3000 }).catch(async () => {
        await menu.click().catch(() => {});
        await page.waitForTimeout(400);
        await page.getByRole('menuitem', { name: t(lang, 'parties.archive.action') }).first().click().catch(() => {});
        await page.getByRole('button', { name: t(lang, 'parties.archive.action') }).first().click().catch(() => {});
      });
      await page.waitForTimeout(1200);
      // The balance check is the SERVER's (PTY-04): confirm, and the dialog swaps to the refusal.
      await page.getByRole('dialog').getByRole('button', { name: t(lang, 'parties.archive.action'), exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(1800);
      await look(page, tag, 'archive-blocked');
      // LED-11 (CR-2026-09-30-LED-11): with a loan open no shop write-off is offered at all —
      // it could clear only the trade figure and the archive would still be refused.
      const writeOff = page.getByRole('button', { name: new RegExp(stem(lang, 'parties.writeOff.action')) });
      record(`${tag} a party with a loan is offered no write-off`, (await writeOff.count()) === 0, (await writeOff.count()) ? await writeOff.first().innerText() : '');
      record(`${tag} the refusal says a loan cannot be written off here`, (await page.getByText(pattern(lang, 'parties.archive.blocked.optionsLoan')).count()) > 0);
      await closeDialog(page);

      // Payments: the receipt's unapplied advance and Apply to bills.
      await go(page, `/payments/${ids.advance}`);
      await look(page, tag, 'receipt-unapplied');
      await page.getByRole('button', { name: t(lang, 'payments.apply.action') }).first().click().catch(() => {});
      await page.waitForTimeout(1800);
      await look(page, tag, 'apply-to-bills');
      await closeDialog(page);

      // Payments: voiding a deposit adjustment names its pair.
      await go(page, `/payments/${ids.adjustmentOut}`);
      await page.getByRole('button', { name: t(lang, 'payments.void.action') }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await look(page, tag, 'void-deposit-pair');
      record(`${tag} the void dialog names the matching adjustment`, (await page.getByText(new RegExp(stem(lang, 'payments.void.consequence.depositPair'))).count()) > 0);
      await closeDialog(page);

      // Sales: the origin badge, the void that asks the module first, a value credit note.
      await go(page, '/sales/invoices');
      await look(page, tag, 'invoices-origin');
      await go(page, `/sales/invoices/${ids.originInvoice}`);
      await look(page, tag, 'invoice-origin');
      await page.getByRole('button', { name: t(lang, 'sales.void.action') }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      const reason = page.getByRole('dialog').locator('textarea, input[type="text"]').first();
      if (await reason.count()) await reason.fill('Duplicate bill');
      await page.getByRole('button', { name: t(lang, 'sales.void.confirm') }).first().click().catch(() => {});
      await page.waitForTimeout(1800);
      await look(page, tag, 'void-origin-confirm');
      record(`${tag} the void asks the issuing module's question with Void anyway`, (await page.getByRole('button', { name: t(lang, 'sales.void.confirmAnyway') }).count()) > 0);
      await closeDialog(page);
      await go(page, `/sales/credit-notes/${ids.valueCreditNote}`);
      await look(page, tag, 'value-credit-note');

      // Deposits on the khata again, after a return taken from the drawer (en light only: one act).
      // Settings: the refusal banner when payments still holds a deposit.
      await go(page, '/settings');
      await look(page, tag, 'settings');
      const paymentsSwitch = page.getByRole('switch', { name: new RegExp(t(lang, 'nav.module.payments') ?? 'Payments', 'i') }).first();
      if (await paymentsSwitch.count()) {
        await paymentsSwitch.click();
        await page.waitForTimeout(2000);
        await look(page, tag, 'module-off-refused');
        record(`${tag} switching payments off is refused in place`, (await page.getByText(t(lang, 'settings.module.closeFirst')).count()) > 0);
      } else record(`${tag} Settings shows the payments switch`, false);
      await go(page, '/settings/business-days');
      await look(page, tag, 'business-days');
      await go(page, '/ledger/reminders');
      await look(page, tag, 'reminders');
      await page.getByRole('button', { name: t(lang, 'reminders.settings.open') }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await look(page, tag, 'reminder-hours');
      await closeDialog(page);
      await go(page, '/settings/team');
      await look(page, tag, 'team');
      await page.getByRole('button', { name: t(lang, 'team.member.add.action') }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      await look(page, tag, 'team-add-member');
      await closeDialog(page);
      await ctx.close();
    }
  }
}
await browser.close();

const failed = results.filter((r) => !r.ok);
writeFileSync(`${SHOTS}/summary.json`, JSON.stringify({ total: results.length, failed }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} checks passed; shots in ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
