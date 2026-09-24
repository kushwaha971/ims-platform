import { invoiceListQuery } from '../api/salesService';
import { makeDocument, wireLine } from '../testing/salesFixtures';

import { daysOverdue, invoiceFiltersFromQuery, invoiceQueryFromFilters } from './invoiceDisplay';
import {
  emptyInvoiceForm,
  emptyLine,
  fromDocument,
  fullCashPayment,
  paymentWireBody,
  ratePlaces,
  toWireBody,
} from './invoiceForm';

/**
 * The editor's and the list's pure decisions: what is SENT (the wire body and
 * the list query) and what the address bar round-trips. Each case names the
 * defect it prevents.
 */

const TODAY = '2026-09-24';

describe('invoice form → wire', () => {
  it('sends only complete lines, so an empty trailing row never becomes a ₹0 line', () => {
    const form = emptyInvoiceForm(TODAY, 'walkIn', '27');
    form.lines = [
      { ...emptyLine(), itemId: 'i1', description: 'Basmati', qty: '2', unitPrice: '450' },
      emptyLine(),
    ];
    const body = toWireBody(form);
    expect(body.lines).toHaveLength(1);
    expect(body).toMatchObject({ party_id: null, walk_in_name: null, due_on: null });
  });

  it('drops the walk-in fields on a party bill and keeps the due date', () => {
    // A party bill that also carried a walk-in name would print two customers.
    const form = {
      ...emptyInvoiceForm(TODAY, 'party', '27'),
      partyId: 'p1',
      walkInName: 'Leftover',
      dueOn: '2026-10-09',
    };
    expect(toWireBody(form)).toMatchObject({
      party_id: 'p1',
      walk_in_name: null,
      due_on: '2026-10-09',
    });
  });

  it('round-trips a server draft through the form without losing a line', () => {
    const doc = makeDocument({ status: 'draft', number: null, lines: [wireLine()] });
    const body = toWireBody(fromDocument(doc));
    expect(body.lines).toEqual([
      expect.objectContaining({ item_id: 'i1', qty: '1.000', tax_code: 'GST5' }),
    ]);
  });

  it('pays a walk-in in full, in cash, by default (SAL-07 FR-3)', () => {
    const rows = fullCashPayment('473.00');
    expect(paymentWireBody(rows, TODAY)).toEqual({
      payment_date: TODAY,
      mode_breakup: [{ mode: 'cash', amount: '473.00', reference: '' }],
    });
  });

  it('leaves an empty split row out of the payment, rather than sending ₹0 UPI', () => {
    const rows = [
      { mode: 'cash' as const, amount: '473.00', reference: '' },
      { mode: 'upi' as const, amount: '', reference: '' },
    ];
    expect(paymentWireBody(rows, TODAY).mode_breakup).toHaveLength(1);
  });

  it('shows a rate at two places unless it genuinely carries more', () => {
    // "450.0000" at a counter reads as a typo; "12.3450" is real precision.
    expect(ratePlaces('450.0000')).toBe(2);
    expect(ratePlaces('12.3450')).toBe(4);
    expect(ratePlaces('')).toBe(2);
  });
});

describe('the list in the address bar (SAL-08 FR-3)', () => {
  it('defaults to this financial year, all tabs, and writes nothing to the URL', () => {
    const filters = invoiceFiltersFromQuery(new URLSearchParams(''), TODAY);
    expect(filters).toMatchObject({
      preset: 'thisFy',
      dateFrom: '2026-04-01',
      dateTo: TODAY,
      tab: 'all',
      page: 1,
    });
    expect(invoiceQueryFromFilters(filters)).toBe('');
  });

  it('round-trips a custom range, a tab and a search', () => {
    const qs = 'period=custom&from=2026-09-01&to=2026-09-15&tab=unpaid&q=Ramesh';
    const filters = invoiceFiltersFromQuery(new URLSearchParams(qs), TODAY);
    expect(invoiceQueryFromFilters(filters)).toBe(qs);
  });

  it('ignores a tab it does not know rather than asking the server for it', () => {
    // An unknown tab is a 400 from the server; a hand-edited link must not break the page.
    const filters = invoiceFiltersFromQuery(new URLSearchParams('tab=bogus&page=-3'), TODAY);
    expect(filters.tab).toBe('all');
    expect(filters.page).toBe(1);
  });

  it('sends the tab and dates to the server and omits the defaults', () => {
    expect(
      invoiceListQuery({
        tab: 'overdue',
        dateFrom: '2026-04-01',
        dateTo: TODAY,
        partyId: null,
        q: ' ',
        page: 1,
      })
    ).toBe(`?tab=overdue&date_from=2026-04-01&date_to=${TODAY}`);
  });

  it('counts overdue days from the due date, and none on the day itself', () => {
    expect(daysOverdue('2026-09-21', TODAY)).toBe(3);
    expect(daysOverdue(TODAY, TODAY)).toBe(0);
    expect(daysOverdue(null, TODAY)).toBe(0);
  });
});
