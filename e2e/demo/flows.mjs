/**
 * e2e/demo/flows.mjs — what the recordings DO, written once for both screens.
 *
 * Every landing-page loop and every scene of the narrated films is one of
 * these flows, performed on the demo stack's real screens. A flow takes a
 * `stage` (the page plus helpers that know whether this is the phone or the
 * desktop layout) and does what a merchant would do: opens, taps, types,
 * saves. Nothing is mocked and no figure is typed into the picture — what the
 * recording shows is what the product computed.
 *
 * `soft(label, fn)` runs a step and, if it cannot be performed, records it as
 * MISSED and carries on, so one changed button fails the run loudly (the
 * recorder exits non-zero) without throwing away the rest of the take.
 */
import { FE, clickEl, sleep, typeSlow } from './lib.mjs';

export const DESKTOP = { name: 'desktop', mobile: false, launch: {}, context: { viewport: { width: 1280, height: 800 } } };
/**
 * The phone: a 390 px touch layout, recorded at twice that. Playwright's video
 * is taken in CSS pixels whatever `deviceScaleFactor` the context asks for —
 * with it set to 2 the 390 px screen came out in the top-left corner of a
 * 780 px frame (found on 11 Oct 2026, in every phone take). Chromium's own
 * `--force-device-scale-factor=2` is what makes the recorded surface 780 px
 * wide, so the phone videos are full-frame and sharp.
 */
export const PHONE = { name: 'mobile', mobile: true, launch: { args: ['--force-device-scale-factor=2'] }, context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } };

export const makeStage = (page, device, missed = []) => {
  const stage = {
    page,
    mobile: device.mobile,
    missed,
    pause: (ms) => sleep(ms),
    go: async (route) => { await page.goto(`${FE}${route}`, { waitUntil: 'networkidle' }); await sleep(350); },
    tap: (locator, opts) => clickEl(page, locator, { steps: device.mobile ? 14 : 22, ...opts }),
    type: (text, delay = 90) => typeSlow(page, text, delay),
    soft: async (label, fn) => { try { await fn(); } catch (e) { missed.push(`${label} — ${String(e.message).split('\n')[0].slice(0, 150)}`); console.log('MISSED', label); } },
    /** Move the pointer over things worth looking at. */
    look: async (locators, hold = 800) => { for (const locator of locators) { const box = await locator.first().boundingBox().catch(() => null); if (!box) continue; await page.mouse.move(box.x + Math.min(box.width / 2, 160), box.y + box.height / 2, { steps: 20 }); await sleep(hold); } },
    scroll: async (dy, hold = 900) => { await page.mouse.wheel(0, dy); await sleep(hold); },
    settle: () => page.waitForLoadState('networkidle').catch(() => {}),
    /** Sidebar on a desktop; on a phone the route is opened directly. */
    nav: async (name, route) => {
      const link = page.getByRole('navigation').getByRole('link', { name, exact: true }).first();
      if (!device.mobile && (await link.isVisible().catch(() => false))) { await stage.tap(link, { after: 250 }); await stage.settle(); await sleep(300); } else await stage.go(route);
    },
    dialog: () => page.getByRole('dialog').last(),
  };
  return stage;
};

const openRow = (st, name) => st.tap(st.page.getByRole('button', { name: `Open ${name}`, exact: false }).first(), { after: 250 });

// ── Shop & billing ──────────────────────────────────────────────────────────

export const shop = {
  dashboard: async (st, hold = 1500) => {
    await st.go('/dashboard');
    await st.look([st.page.getByText('To collect').first(), st.page.getByText('To pay').first()], 700);
    await st.pause(hold);
  },

  openKhata: async (st, name = 'Ramesh Traders') => {
    await st.nav('Customers', '/customers');
    await st.pause(700);
    await st.soft(`open ${name}`, async () => { await openRow(st, name); await st.page.waitForURL(/\/parties\/[0-9a-f-]{20,}/, { timeout: 15000 }); await st.settle(); });
    await st.pause(700);
  },

  /** `kind`: "gave" | "got". Leaves the khata showing the new balance. */
  entry: async (st, kind, amount, note) => {
    await st.soft(`you ${kind} ${amount}`, async () => {
      await st.tap(st.page.getByRole('button', { name: kind === 'gave' ? /You gave/ : /You got/ }).first(), { after: 250 });
      await st.page.waitForSelector('role=dialog', { timeout: 15000 });
      await st.pause(500);
      await st.page.getByLabel('Amount').click();
      await st.type(amount, 150);
      if (note) { await st.tap(st.dialog().getByLabel(/^Note/), { after: 120 }); await st.type(note, 55); }
      await st.pause(350);
      await st.tap(st.dialog().getByRole('button', { name: 'Save', exact: true }), { after: 300 });
      await st.page.waitForSelector('role=dialog', { state: 'detached', timeout: 15000 }).catch(() => {});
    });
    await st.pause(900);
  },

  reminder: async (st) => {
    await st.soft('send reminder', async () => {
      await st.tap(st.page.getByRole('button', { name: 'More actions', exact: true }).first(), { after: 600 });
      await st.tap(st.page.getByRole('button', { name: 'Send reminder' }).first(), { after: 400 });
      await st.pause(1900);
    });
    await st.page.keyboard.press('Escape');
    await st.pause(300);
    await st.page.keyboard.press('Escape');
    await st.go('/ledger/aging');
    await st.pause(1400);
  },

  /** A bill from the first field to the issued invoice. `items`: [search, full name, qty][]. */
  bill: async (st, party, items, { issue = true } = {}) => {
    await st.go('/sales/invoices/new');
    await st.soft(`bill party ${party}`, async () => {
      await st.tap(st.page.getByRole('radio', { name: 'Party' }), { after: 300 });
      await st.tap(st.page.getByPlaceholder('Search by name or mobile'), { after: 120 });
      await st.type(party.slice(0, 5), 100);
      await st.pause(1100);
      await st.tap(st.page.getByRole('option', { name: new RegExp(party) }).or(st.page.getByText(party)).first(), { after: 450 });
    });
    for (const [n, [search, name, qty]] of items.entries()) {
      await st.soft(`bill item ${name}`, async () => {
        const empty = st.page.locator('[role=combobox]', { hasText: /Search or scan an item/ });
        if (!(await empty.count())) await st.tap(st.page.getByRole('button', { name: 'Add item' }).first(), { after: 350 });
        await st.tap(empty.first(), { after: 150 });
        await st.type(search, 110);
        await st.pause(1000);
        await st.tap(st.page.getByRole('option', { name: new RegExp(name) }).first(), { after: 400 });
        const field = st.page.locator('input[aria-label^="Qty"]').nth(n);
        await field.fill(String(qty));
        await st.pause(350);
      });
    }
    await st.soft('bill totals', async () => { const totals = st.page.getByTestId('invoice-totals'); await totals.scrollIntoViewIfNeeded(); await st.look([totals], 1300); });
    if (!issue) return;
    await st.soft('issue bill', async () => {
      await st.tap(st.page.getByRole('button', { name: 'Issue', exact: true }).first(), { after: 350 });
      // "Payment": this bill is a credit sale, so nothing is received now.
      const credit = st.dialog().getByRole('button', { name: /Full credit/ });
      if (await credit.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) await st.tap(credit, { after: 300 });
      // "INV/… issued": open the bill itself.
      const view = st.dialog().getByRole('button', { name: 'View bill' });
      await view.waitFor({ timeout: 20000 });
      await st.pause(900);
      await st.tap(view, { after: 300 });
      await st.page.waitForURL(/\/sales\/invoices\/[0-9a-f-]{20,}$/, { timeout: 20000 });
      await st.settle();
    });
    await st.pause(1500);
  },

  stock: async (st) => {
    await st.nav('Items', '/items');
    await st.pause(700);
    await st.soft('low tab', async () => { await st.tap(st.page.getByRole('tab', { name: /^Low/ }), { after: 900 }); });
    await st.soft('open item', async () => {
      const row = st.mobile ? st.page.getByRole('button', { name: /Open Bath Soap/ }) : st.page.getByRole('link', { name: 'Bath Soap' });
      await st.tap(row.first(), { after: 300 });
      await st.page.waitForURL(/\/items\/[0-9a-f-]{20,}/, { timeout: 15000 });
      await st.settle();
    });
    await st.pause(1300);
    await st.soft('adjust stock', async () => {
      const adjust = st.page.getByRole('button', { name: 'Adjust stock' }).first();
      if (!(await adjust.isVisible().catch(() => false))) await st.tap(st.page.getByRole('button', { name: 'More actions', exact: true }).first(), { after: 500 });
      await st.tap(st.page.getByRole('button', { name: 'Adjust stock' }).or(st.page.getByRole('menuitem', { name: 'Adjust stock' })).first(), { after: 700 });
      await st.page.waitForSelector('role=dialog', { timeout: 10000 });
      const qty = st.dialog().locator('input[aria-label^="Qty"]').first();
      await st.tap(qty, { after: 120 });
      await st.type('-1', 160);
      await st.pause(1100);
    });
  },

  purchase: async (st) => {
    await st.go('/purchases/bills/new');
    await st.soft('purchase supplier', async () => {
      await st.tap(st.page.getByRole('combobox', { name: 'Supplier' }), { after: 120 });
      await st.type('Gupta', 100);
      await st.pause(1100);
      await st.tap(st.page.getByRole('option', { name: /Gupta Wholesale/ }).first(), { after: 450 });
    });
    await st.soft('purchase item', async () => {
      await st.tap(st.page.getByRole('combobox', { name: /Item, line 1/i }), { after: 150 });
      await st.type('Tea', 110);
      await st.pause(1000);
      await st.tap(st.page.getByRole('option', { name: /Tea 250g/ }).first(), { after: 400 });
      await st.page.getByLabel(/Qty, line 1/i).fill('12');
      await st.pause(500);
    });
    await st.soft('purchase totals', async () => { await st.scroll(st.mobile ? 420 : 260, 1100); });
    await st.soft('record purchase', async () => {
      await st.tap(st.page.getByRole('button', { name: 'Record', exact: true }).first(), { after: 900 });
      // "Paid now?" — the bill is recorded as paid in cash, in the same step.
      await st.tap(st.dialog().getByRole('button', { name: /^Paid .* Record$/ }), { after: 400 });
      await st.page.waitForSelector('role=dialog', { state: 'detached', timeout: 20000 });
      await st.settle();
    });
    await st.pause(1500);
  },

  reports: async (st) => {
    await st.nav('Reports', '/reports');
    await st.pause(1000);
    await st.soft('day book', async () => { await st.tap(st.page.getByRole('link', { name: 'Day book' }).first(), { after: 300 }); await st.settle(); });
    await st.pause(1500);
    await st.go('/reports');
    await st.soft('gst summary', async () => { await st.tap(st.page.getByRole('link', { name: 'GST summary' }).first(), { after: 300 }); await st.settle(); });
    await st.pause(1600);
  },

  itemsAndReports: async (st, cue) => {
    await st.nav('Items', '/items');
    await st.look([st.page.getByRole('tab', { name: /^Low/ })], 900);
    await st.soft('low tab', async () => { await st.tap(st.page.getByRole('tab', { name: /^Low/ }), { after: 900 }); });
    await cue(1);
    await st.nav('Reports', '/reports');
    await st.look([st.page.getByRole('link', { name: 'Day book' }), st.page.getByRole('link', { name: 'Receivables aging' }), st.page.getByRole('link', { name: 'Sales register' }), st.page.getByRole('link', { name: 'GST summary' })], 850);
  },
};

// ── Library ─────────────────────────────────────────────────────────────────

export const library = {
  home: async (st, hold = 1500) => { await st.go('/library'); await st.pause(hold); },
  students: async (st) => { await st.nav('Students', '/library/members'); await st.pause(1100); },
  admission: async (st) => {
    await st.soft('new admission', async () => {
      await st.tap(st.page.getByRole('button', { name: /New admission/ }).first(), { after: 700 });
      await st.tap(st.dialog().getByLabel('Name', { exact: true }), { after: 120 });
      await st.type('Kavita Deshmukh', 65);
      await st.pause(500);
      await st.look([st.dialog().getByLabel('Plan'), st.dialog().getByLabel('Shift'), st.dialog().getByLabel('Seat')], 800);
    });
  },
  closeDialog: async (st) => {
    await st.page.keyboard.press('Escape');
    await st.pause(300);
    await st.page.getByRole('dialog').getByRole('button', { name: /Discard|Leave|Yes/ }).click({ timeout: 1000 }).catch(() => {});
    await st.pause(200);
  },
  catalogue: async (st, search = 'aptitude') => {
    await st.nav('Catalogue', '/library/catalogue');
    await st.soft('search books', async () => { await st.tap(st.page.getByPlaceholder(/Title, author|Search books/).first(), { after: 120 }); await st.type(search, 100); await st.pause(1300); });
  },
  issue: async (st, member, copy) => {
    await st.nav('Counter', '/library/counter');
    await st.soft('issue', async () => {
      await st.tap(st.page.getByPlaceholder(/Scan/).first(), { after: 150 });
      await st.type(member, 140); await st.page.keyboard.press('Enter'); await st.pause(1400);
      await st.type(copy, 190); await st.page.keyboard.press('Enter'); await st.pause(1700);
    });
  },
  returnBook: async (st, copy) => {
    await st.soft('return', async () => {
      await st.tap(st.page.getByRole('radio', { name: 'Return' }).or(st.page.getByRole('button', { name: 'Return', exact: true })).first(), { after: 500 });
      await st.tap(st.page.getByPlaceholder(/Scan/).first(), { after: 120 });
      await st.type(copy, 190); await st.page.keyboard.press('Enter'); await st.pause(1500);
    });
  },
  seatsAndAttendance: async (st) => {
    await st.nav('Seats', '/library/seats'); await st.pause(1500);
    await st.nav('Attendance', '/library/attendance'); await st.pause(1300);
  },
};

// ── Lending ─────────────────────────────────────────────────────────────────

export const lending = {
  today: async (st, hold = 1500) => {
    await st.go('/lending');
    await st.page.getByRole('button', { name: 'Hide' }).click({ timeout: 1200 }).catch(() => {});
    await st.pause(hold);
  },
  collect: async (st) => {
    await st.soft('collect', async () => {
      await st.tap(st.page.getByRole('button', { name: /^Collect ₹/ }).first(), { after: 1100 });
      await st.tap(st.dialog().getByText('UPI', { exact: true }), { after: 800 });
      await st.tap(st.dialog().getByRole('button', { name: 'Save collection' }), { after: 400 });
      await st.page.waitForSelector('role=dialog', { state: 'detached', timeout: 15000 }).catch(() => {});
    });
    await st.pause(1500);
  },
  loans: async (st) => { await st.nav('Loans', '/lending/loans'); await st.pause(1300); },
  openLoan: async (st, name = 'Salma Begum') => {
    await st.soft('open loan', async () => { await st.tap(st.page.getByText(name).first(), { after: 300 }); await st.page.waitForURL(/\/lending\/loans\/[0-9a-f-]{20,}/, { timeout: 15000 }); await st.settle(); });
    await st.pause(900);
    await st.scroll(420); await st.scroll(420);
  },
  newLoan: async (st) => { await st.go('/lending/loans/new'); await st.pause(900); await st.scroll(380, 1000); },
};
