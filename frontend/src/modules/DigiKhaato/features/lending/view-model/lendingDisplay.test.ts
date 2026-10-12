import {
  defaultFirstDue,
  askedToday,
  caption,
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

describe('a row caption', () => {
  it('says each word once, in order, without blanks', () => {
    expect(caption(['Station road', 'LN-0004', 'Station road'])).toBe('Station road · LN-0004');
    expect(caption(['B-0001', '', null, 'Market lane 2', undefined])).toBe(
      'B-0001 · Market lane 2'
    );
  });
});

describe('defaultFirstDue (QA B46 / F12)', () => {
  /* Prevents: a weekly loan whose first instalment defaults to tomorrow, and a back-dated
     loan whose first instalment stays where it was — a 2½-month gap and a yearly rate that
     jumps with it. */
  it('is one period after the money was given', () => {
    expect(defaultFirstDue('2026-10-12', 'daily', 'fixed_daily')).toBe('2026-10-13');
    expect(defaultFirstDue('2026-10-12', 'weekly', 'flat')).toBe('2026-10-19');
    expect(defaultFirstDue('2026-10-12', 'fortnightly', 'flat')).toBe('2026-10-26');
    expect(defaultFirstDue('2026-10-12', 'monthly', 'reducing')).toBe('2026-11-12');
    expect(defaultFirstDue('2026-08-01', 'weekly', 'flat')).toBe('2026-08-08');
  });

  it('keeps a month-end loan on the last day of a shorter month', () => {
    expect(defaultFirstDue('2026-01-31', 'monthly', 'flat')).toBe('2026-02-28');
  });

  it('gives a flexible loan its 90-day end date', () => {
    expect(defaultFirstDue('2026-10-12', 'monthly', 'flexible')).toBe('2027-01-10');
  });
});
