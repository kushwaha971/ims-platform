import { askedToday, stopState } from './lendingDisplay';

import type { TodayStop } from '../types/lending.types';

/**
 * L02 — a stop's word on today's round. The owner's case: a borrower who
 * skipped days owes today's instalment AND the late ones, so "to collect"
 * is both; a stop paid in part still asks for the rest.
 */
const stop = (over: Partial<TodayStop>): TodayStop => ({
  loanId: 'l1',
  number: 'LN-0001',
  name: 'Ramesh',
  mobile: null,
  area: '',
  route: null,
  seq: 1,
  frequency: 'daily',
  instalmentAmount: '500.00',
  dueToday: '500.00',
  arrears: '0.00',
  daysPastDue: 0,
  collectedToday: '0.00',
  remaining: '10000.00',
  visit: null,
  ...over,
});

describe('lendingDisplay', () => {
  it('asks for today and every late instalment together', () => {
    expect(askedToday(stop({ arrears: '1500.00' }))).toBe('2000.00');
  });

  it('says late, due, part paid, paid and visited', () => {
    expect(stopState(stop({ arrears: '1500.00' }))).toBe('late');
    expect(stopState(stop({}))).toBe('due');
    expect(stopState(stop({ dueToday: '200.00', collectedToday: '300.00' }))).toBe('part');
    expect(stopState(stop({ dueToday: '0.00', collectedToday: '500.00' }))).toBe('paid');
    expect(stopState(stop({ visit: { outcome: 'not_paid', reason: '', promisedOn: null } }))).toBe(
      'visited'
    );
  });
});
