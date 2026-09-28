import { expenseListQuery, toWireBody } from './expenseService';

import type { ExpenseFilters, ExpenseFormValues } from '../types/expense.types';

/**
 * The two places the client decides what goes on the wire. Each test names
 * what a wrong body would do to the merchant's book.
 */
const VALUES: ExpenseFormValues = {
  amount: '500',
  categoryId: 'cat-1',
  expenseDate: '2026-09-24',
  paid: true,
  mode: 'upi',
  upiApp: 'phonepe',
  reference: ' UTR 4471 ',
  partyId: '',
  partyName: '',
  dueOn: '2026-10-05',
  note: '  Tea ',
};

describe('toWireBody', () => {
  it('sends how a paid expense was paid, and no due date', () => {
    expect(toWireBody(VALUES)).toEqual({
      amount: '500',
      category_id: 'cat-1',
      expense_date: '2026-09-24',
      paid: true,
      note: 'Tea',
      party_id: null,
      mode: 'upi',
      upi_app: 'phonepe',
      reference: 'UTR 4471',
    });
  });

  it('sends no mode, app or reference for an unpaid expense', () => {
    /* Money that has not moved has no "how". The server drops them anyway;
       sending them would put a UTR in the request log against nothing, and
       the form keeps them only so switching Paid now back on loses nothing. */
    const body = toWireBody({ ...VALUES, paid: false, partyId: 'p1' });
    expect(body).toEqual({
      amount: '500',
      category_id: 'cat-1',
      expense_date: '2026-09-24',
      paid: false,
      note: 'Tea',
      party_id: 'p1',
      due_on: '2026-10-05',
    });
  });

  it('drops a UPI app left in form state after switching to cash', () => {
    const body = toWireBody({ ...VALUES, mode: 'cash' });
    expect(body.upi_app).toBeNull();
    expect(body.reference).toBe('');
  });
});

describe('expenseListQuery', () => {
  const FILTERS: ExpenseFilters = {
    preset: 'thisMonth',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-24',
    tab: 'all',
    categoryId: null,
    mode: null,
    q: '',
    page: 1,
  };

  it('asks for recorded expenses by default and never for voids', () => {
    // "All" must not count money the merchant said did not go out.
    expect(expenseListQuery(FILTERS)).toBe('?date_from=2026-09-01&date_to=2026-09-24');
  });

  it('maps each tab to the server filter that means it', () => {
    expect(expenseListQuery({ ...FILTERS, tab: 'void' })).toContain('status=void');
    expect(expenseListQuery({ ...FILTERS, tab: 'unpaid' })).toContain('paid=false');
    expect(
      expenseListQuery({ ...FILTERS, categoryId: 'c', mode: 'cash', q: ' rent ', page: 3 })
    ).toBe('?date_from=2026-09-01&date_to=2026-09-24&category=c&mode=cash&q=rent&page=3');
  });
});
