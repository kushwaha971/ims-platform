import {
  askedToday,
  isRemindable,
  localClock,
  localDay,
  nextDay,
  stopState,
} from './lendingDisplay';

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
  remindedToday: false,
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

/**
 * L03 — Remind is offered for FRD LEN-12's three buckets only, on the calendar
 * of the lender's day (a month end and a year end included), and a sent time
 * is read off the server's tenant-local string, never moved to the device zone.
 */
describe('the reminder decisions', () => {
  it('steps a day across a month and a year end', () => {
    expect(nextDay('2026-10-05')).toBe('2026-10-06');
    expect(nextDay('2026-10-31')).toBe('2026-11-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });

  const loan = (over: Partial<Parameters<typeof isRemindable>[0]>) => ({
    status: 'active',
    arrears: '0.00',
    dueToday: '0.00',
    nextDueOn: '2026-10-09',
    ...over,
  });

  it('offers Remind when late, due today or due tomorrow, and not otherwise', () => {
    const today = '2026-10-05';
    expect(isRemindable(loan({ arrears: '240.00' }), today)).toBe(true);
    expect(isRemindable(loan({ dueToday: '120.00' }), today)).toBe(true);
    expect(isRemindable(loan({ nextDueOn: '2026-10-06' }), today)).toBe(true);
    expect(isRemindable(loan({}), today)).toBe(false);
    expect(isRemindable(loan({ status: 'written_off', arrears: '240.00' }), today)).toBe(false);
  });

  it("reads the lender's own clock off the string", () => {
    expect(localClock('2026-10-05T10:14:03.120000+04:00')).toBe('10:14');
    expect(localDay('2026-10-05T23:50:00+05:30')).toBe('2026-10-05');
    expect(localClock(null)).toBe('');
  });
});
