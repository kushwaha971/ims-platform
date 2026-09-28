import { gstDrillHref } from './gstDisplay';
import {
  documentHref,
  isCreditRow,
  isRegisterNarrowed,
  registerFiltersFromQuery,
  registerParams,
  registerPath,
  registerQueryFromFilters,
} from './registerDisplay';

import type { RegisterRow } from '../types/taxReports.types';

/**
 * What these protect: the register's filters survive the address bar both
 * ways (so a link the owner sends opens the same view), the chips become the
 * SERVER's parameter names and status sets (a chip that lights up and asks
 * nothing is PTY-02's defect), and a GST rate row drills into exactly the
 * register lines behind it.
 */
const TODAY = '2026-09-28';

describe('register filters in the URL', () => {
  it('defaults to this month, documents, everything, no voids', () => {
    const filters = registerFiltersFromQuery(new URLSearchParams(), TODAY);
    expect(filters).toMatchObject({
      preset: 'thisMonth',
      dateFrom: '2026-09-01',
      dateTo: TODAY,
      level: 'document',
      status: 'all',
      party: 'all',
      includeVoid: false,
      taxCode: null,
      interState: null,
      page: 1,
    });
    expect(registerQueryFromFilters(filters)).toBe('');
    expect(isRegisterNarrowed(filters)).toBe(false);
  });

  it('round-trips every filter', () => {
    const query =
      'period=lastMonth&level=line&status=unpaid&party=b2b&kind=credit_note&void=true&tax_code=GST5&inter_state=false&page=3';
    const filters = registerFiltersFromQuery(new URLSearchParams(query), TODAY);
    expect(filters.dateFrom).toBe('2026-08-01');
    expect(isRegisterNarrowed(filters)).toBe(true);
    expect(
      registerFiltersFromQuery(new URLSearchParams(registerQueryFromFilters(filters)), TODAY)
    ).toEqual(filters);
  });
});

describe('registerParams — the chips as the server reads them', () => {
  const base = registerFiltersFromQuery(new URLSearchParams(), TODAY);

  it('maps a sales chip set onto RPT-03 FR-1 parameters', () => {
    expect(
      registerParams('sales', {
        ...base,
        status: 'unpaid',
        party: 'b2c',
        kind: 'invoice',
        includeVoid: true,
      })
    ).toEqual({
      date_from: '2026-09-01',
      date_to: TODAY,
      level: null,
      status: 'issued,partially_paid,overdue',
      b2b: false,
      kind: 'invoice',
      itc: null,
      include_void: true,
      tax_code: null,
      inter_state: null,
    });
  });

  it('sends ITC only for purchases, and the purchase statuses', () => {
    const params = registerParams('purchase', {
      ...base,
      status: 'unpaid',
      itc: 'blocked',
      party: 'b2b',
    });
    expect(params).toMatchObject({
      status: 'recorded,partially_paid,overdue',
      itc: false,
      b2b: null,
    });
  });

  it('builds the path the export appends format=csv to', () => {
    expect(registerPath({ book: 'purchase', filters: { ...base, level: 'line' } })).toBe(
      '/reports/purchase-register?date_from=2026-09-01&date_to=2026-09-28&level=line'
    );
  });
});

describe('rows', () => {
  const row = { documentId: 'd 1', kind: 'credit_note', grandTotal: '-465.81' } as RegisterRow;

  it('recognises a credit note and opens it on its own route', () => {
    expect(isCreditRow(row)).toBe(true);
    expect(documentHref('sales', row)).toBe('/sales/credit-notes/d%201');
    expect(documentHref('sales', { ...row, kind: 'invoice' })).toBe('/sales/invoices/d%201');
    expect(documentHref('purchase', row)).toBe('/purchases/bills/d%201');
  });
});

it('drills a GST rate row into the register lines at that code and supply', () => {
  const href = gstDrillHref(
    { dateFrom: '2026-08-01', dateTo: '2026-08-31', rounding: 'paise' },
    { taxCode: 'GST18', isInterState: true }
  );
  expect(href).toBe(
    '/reports/sales-register?period=custom&from=2026-08-01&to=2026-08-31&level=line&tax_code=GST18&inter_state=true'
  );
  const filters = registerFiltersFromQuery(new URLSearchParams(href.split('?')[1]), TODAY);
  expect(filters).toMatchObject({
    level: 'line',
    taxCode: 'GST18',
    interState: true,
    dateFrom: '2026-08-01',
  });
});
