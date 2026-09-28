import { ROUTES } from 'src/routes';

import { REPORT_CATALOGUE, visibleReports } from '../constants/reportCatalogue';

import {
  activityLabelId,
  isFirstUse,
  salesDelta,
  secondsSince,
  shortInr,
  tileHref,
  tileTone,
} from './dashboardDisplay';
import {
  dayBookFiltersFromQuery,
  dayBookQueryFromFilters,
  groupByDate,
  typeLabelId,
  typesForFilters,
  typeTone,
} from './dayBookDisplay';
import { sourceHref } from './drillThrough';
import { periodFromQuery, resolveReportPreset, spansDays } from './reportPeriod';

import type { DayBookRow } from '../types/reports.types';

const UNITS = { lakh: 'L', crore: 'Cr' };
const TODAY = '2026-09-18';

describe('shortInr (RPT-01 NFR — "₹1.2 L / ₹3.4 Cr above 5 digits")', () => {
  it('leaves a figure under a lakh whole, with its paise', () => {
    expect(shortInr('99999.50', UNITS)).toEqual({ text: '₹99,999.50', full: '₹99,999.50' });
  });

  it('shortens lakhs and crores to one decimal, rounding DOWN so it never overstates', () => {
    expect(shortInr('123456.78', UNITS).text).toBe('₹1.2 L');
    expect(shortInr('199999.99', UNITS).text).toBe('₹1.9 L');
    expect(shortInr('34000000', UNITS).text).toBe('₹3.4 Cr');
    expect(shortInr('200000', UNITS).text).toBe('₹2 L');
    expect(shortInr('123456.78', UNITS).full).toBe('₹1,23,456.78');
  });

  it('keeps the sign of a returns day (EC-3)', () => {
    expect(shortInr('-150000', UNITS).text).toBe('−₹1.5 L');
  });

  it('takes its unit words from the caller, so Hindi reads लाख', () => {
    expect(shortInr('500000', { lakh: 'लाख', crore: 'करोड़' }).text).toBe('₹5 लाख');
  });
});

describe('the dashboard tiles', () => {
  it('counts seconds since the server computed, never negative (FR-8)', () => {
    const at = '2026-09-18T10:00:00Z';
    expect(secondsSince(at, Date.parse(at) + 30_500)).toBe(30);
    expect(secondsSince(at, Date.parse(at) - 5_000)).toBe(0);
    expect(secondsSince(null, 0)).toBe(0);
  });

  it('opens the list each tile counts (FR-2 "Tap →")', () => {
    expect(tileHref('toCollect', {})).toBe(`${ROUTES.PARTIES}?balance=owes_me`);
    expect(tileHref('dueToday', {})).toBe(`${ROUTES.PARTIES}?collection=today`);
    expect(tileHref('todaySales', {})).toBe(`${ROUTES.SALES_INVOICES}?period=today`);
    expect(tileHref('lowStock', {})).toBe(ROUTES.STOCK_LOW);
    expect(tileHref('cashInHand', {})).toBe(ROUTES.CASHBOOK);
  });

  it('sends Overdue to the bills when only bills are overdue (BR-6)', () => {
    const onlyBills = {
      overdue: { count: 0, amount: '0.00', invoices: { count: 2, amount: '900.00' } },
    };
    expect(tileHref('overdue', onlyBills)).toBe(`${ROUTES.SALES_INVOICES}?tab=overdue`);
    const parties = {
      overdue: { count: 1, amount: '500.00', invoices: { count: 2, amount: '900.00' } },
    };
    expect(tileHref('overdue', parties)).toBe(`${ROUTES.PARTIES}?collection=overdue`);
  });

  it('paints receivable and overdue as the debit tone, payable as success (UX §8)', () => {
    expect(tileTone('toCollect', {})).toBe('danger');
    expect(tileTone('toPay', {})).toBe('success');
    expect(
      tileTone('todaySales', { todaySales: { amount: '-5.00', count: 0, yesterdayAmount: '0' } })
    ).toBe('danger');
    expect(tileTone('lowStock', { lowStock: { count: 3, outCount: 1 } })).toBe('danger');
    expect(tileTone('lowStock', { lowStock: { count: 3, outCount: 0 } })).toBe('warning');
  });

  it('compares with yesterday only when yesterday had sales', () => {
    expect(salesDelta('150.00', '100.00')).toEqual({ percent: 50, direction: 'up' });
    expect(salesDelta('50.00', '100.00')).toEqual({ percent: -50, direction: 'down' });
    expect(salesDelta('50.00', '0.00')).toBeNull();
  });

  it('names a void event in its own words and an unknown one generically', () => {
    const base = {
      id: 'x',
      at: '',
      number: 'INV/1',
      amount: null,
      direction: null,
      party: null,
      source: { kind: 'sales_document' as const, id: 'd1', partyId: null },
    };
    expect(activityLabelId({ ...base, type: 'sale' })).toBe('reports.dashboard.activity.sale');
    expect(activityLabelId({ ...base, type: 'sale_void' })).toBe(
      'reports.dashboard.activity.void.sale'
    );
    expect(activityLabelId({ ...base, type: 'interest' })).toBe('reports.dashboard.activity.other');
  });

  it('shows the checklist only in a truly empty book (FR-9, khata-only shops never bill)', () => {
    expect(isFirstUse({ hasParty: false, hasDocument: false })).toBe(true);
    expect(isFirstUse({ hasParty: true, hasDocument: false })).toBe(false);
  });
});

describe('the report period', () => {
  it("resolves presets against the shop's today, the cashbook's and statement's own arithmetic", () => {
    expect(resolveReportPreset('today', TODAY)).toEqual({ dateFrom: TODAY, dateTo: TODAY });
    expect(resolveReportPreset('yesterday', TODAY)).toEqual({
      dateFrom: '2026-09-17',
      dateTo: '2026-09-17',
    });
    expect(resolveReportPreset('thisWeek', TODAY)).toEqual({
      dateFrom: '2026-09-14',
      dateTo: TODAY,
    });
    expect(resolveReportPreset('lastFy', TODAY)).toEqual({
      dateFrom: '2025-04-01',
      dateTo: '2026-03-31',
    });
    expect(resolveReportPreset('custom', TODAY)).toBeNull();
  });

  it('keeps a valid custom range from the URL and refuses a reversed one', () => {
    const presets = ['today', 'custom'] as const;
    const ok = periodFromQuery(
      new URLSearchParams('from=2026-09-01&to=2026-09-10'),
      TODAY,
      presets,
      'today'
    );
    expect(ok).toEqual({ preset: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-10' });
    const reversed = periodFromQuery(
      new URLSearchParams('from=2026-09-10&to=2026-09-01'),
      TODAY,
      presets,
      'today'
    );
    expect(reversed).toEqual({ preset: 'today', dateFrom: TODAY, dateTo: TODAY });
  });

  it('counts the days in a closed range', () => {
    expect(spansDays(TODAY, TODAY)).toBe(1);
    expect(spansDays('2026-09-01', '2026-09-30')).toBe(30);
  });
});

describe('the day book view-model', () => {
  it('round-trips its filters through the address bar, defaults left out', () => {
    const filters = dayBookFiltersFromQuery(
      new URLSearchParams('period=thisMonth&type=payments,sales,bogus&void=1&page=2'),
      TODAY
    );
    expect(filters).toEqual({
      preset: 'thisMonth',
      dateFrom: '2026-09-01',
      dateTo: TODAY,
      types: ['sales', 'payments'],
      includeVoid: true,
      page: 2,
    });
    expect(dayBookQueryFromFilters(filters)).toBe(
      'period=thisMonth&type=sales%2Cpayments&void=1&page=2'
    );
    expect(dayBookQueryFromFilters(dayBookFiltersFromQuery(new URLSearchParams(''), TODAY))).toBe(
      ''
    );
  });

  it("expands a chip into FR-2's type codes", () => {
    expect(typesForFilters(['payments', 'khata'])).toEqual([
      'payment_in',
      'payment_out',
      'manual_gave',
      'manual_got',
      'opening',
      'write_off',
      'reversal',
    ]);
  });

  const row = (over: Partial<DayBookRow>): DayBookRow => ({
    id: 'r',
    type: 'payment_in',
    void: false,
    source: { kind: 'payment', id: 'p1', partyId: null },
    date: TODAY,
    time: '10:00',
    recordedOn: null,
    number: 'RCT/1',
    party: null,
    walkInName: null,
    amount: '10.00',
    amountDue: null,
    moneyIn: '10.00',
    moneyOut: null,
    modes: [],
    note: '',
    detail: null,
    lines: null,
    paid: null,
    reference: '',
    createdBy: null,
    ...over,
  });

  it('labels a void row by the type it voids, in a neutral tone (FR-7)', () => {
    expect(typeLabelId(row({ type: 'sale_void' }))).toBe('reports.daybook.type.sale');
    expect(typeTone(row({ type: 'payment_in_void', void: true }))).toBe('neutral');
    expect(typeTone(row({}))).toBe('success');
    expect(typeTone(row({ moneyIn: null, moneyOut: '5.00' }))).toBe('error');
  });

  it('groups rows by date in the order they came (the phone timeline, T-RPT02-6)', () => {
    const groups = groupByDate([
      row({ id: 'a', date: '2026-09-17' }),
      row({ id: 'b', date: '2026-09-17' }),
      row({ id: 'c', date: TODAY }),
    ]);
    expect(groups.map((g) => [g.date, g.rows.map((r) => r.id)])).toEqual([
      ['2026-09-17', ['a', 'b']],
      [TODAY, ['c']],
    ]);
  });
});

describe('drill-through (RPT-02 AC-3)', () => {
  it("opens a document's own page, and a khata line's party", () => {
    expect(sourceHref({ kind: 'sales_document', id: 'd1', partyId: 'p1' }, 'INV/1')).toBe(
      `${ROUTES.SALES_INVOICES}/d1`
    );
    expect(sourceHref({ kind: 'payment', id: 'y1', partyId: null }, 'RCT/1')).toBe(
      `${ROUTES.PAYMENTS}/y1`
    );
    expect(sourceHref({ kind: 'ledger_entry', id: 'l1', partyId: 'p1' }, null)).toBe(
      `${ROUTES.PARTIES}/p1`
    );
  });

  it('opens a credit note row — live or void — on its own route, not the invoice page', () => {
    /** The day book and the dashboard's activity sent a credit note to /sales/invoices/{id}. */
    const note = { kind: 'sales_document', id: 'c1', partyId: 'p1' } as const;
    expect(sourceHref(note, 'CN/1', 'credit_note')).toBe(`${ROUTES.SALES_CREDIT_NOTES}/c1`);
    expect(sourceHref(note, 'CN/1', 'credit_note_void')).toBe(`${ROUTES.SALES_CREDIT_NOTES}/c1`);
    expect(sourceHref(note, 'INV/1', 'sale')).toBe(`${ROUTES.SALES_INVOICES}/c1`);
  });

  it('links a stock count nowhere rather than to a page that would 404', () => {
    expect(sourceHref({ kind: 'stock_adjustment', id: 'a1', partyId: null }, 'ADJ/1')).toBeNull();
  });
});

describe('the reports hub catalogue', () => {
  it('lists only what the reader can open — module and every codename', () => {
    const staffNoStock = visibleReports(
      REPORT_CATALOGUE,
      (code) => code !== 'inventory.stock.read',
      () => true
    );
    // Every codename but stock: the stock group goes, the registers and GST stay.
    expect(staffNoStock.map((entry) => entry.key)).toEqual([
      'dayBook',
      'cashbook',
      'receivablesAging',
      'payablesAging',
      'salesRegister',
      'purchaseRegister',
      'gstSummary',
    ]);
    const inventoryOff = visibleReports(
      REPORT_CATALOGUE,
      () => true,
      (module) => module !== 'inventory'
    );
    expect(inventoryOff.some((entry) => entry.group === 'stock')).toBe(false);
  });

  /**
   * RPT-03/04/07 §12 — the three tax-document rows gate exactly as their pages
   * do (useRegisterReport / useGstSummary), so a hub row is never a door to a
   * refusal: staff hold the document reads but not `reports.financial.read`.
   */
  it('gates the registers and the GST summary on the codenames their pages check', () => {
    const keys = (
      can: (code: string) => boolean,
      hasModule: (module: string) => boolean = () => true
    ): string[] =>
      visibleReports(REPORT_CATALOGUE, can, hasModule)
        .filter((entry) => entry.group === 'sales')
        .map((entry) => entry.key);

    expect(keys(() => true)).toEqual(['salesRegister', 'purchaseRegister', 'gstSummary']);
    expect(keys((code) => code !== 'reports.financial.read')).toEqual([
      'salesRegister',
      'purchaseRegister',
    ]);
    expect(keys((code) => code !== 'sales.invoice.read')).toEqual([
      'purchaseRegister',
      'gstSummary',
    ]);
    expect(keys((code) => code !== 'purchases.bill.read')).toEqual(['salesRegister', 'gstSummary']);
    expect(keys((code) => code !== 'reports.basic.read')).toEqual(['gstSummary']);
    expect(
      keys(
        () => true,
        (module) => module !== 'sales'
      )
    ).toEqual(['purchaseRegister', 'gstSummary']);
    expect(
      keys(
        () => true,
        (module) => module !== 'purchases'
      )
    ).toEqual(['salesRegister', 'gstSummary']);
    expect(
      keys(
        () => true,
        (module) => module !== 'reports'
      )
    ).toEqual([]);
  });
});
