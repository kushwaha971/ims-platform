import { addDaysIso, daysBetweenIso } from './dates';

/**
 * WP-03 D-02 — whole calendar days between two business dates had ten
 * hand-written copies (`/ 86_400_000`) across sales, purchases, reminders,
 * library, expenses and the ledger. These are the cases each copy had to get
 * right on its own: month and year ends, a leap day, and both directions.
 */
describe('daysBetweenIso', () => {
  it('counts calendar days from the first date to the second', () => {
    expect(daysBetweenIso('2026-10-16', '2026-10-16')).toBe(0);
    expect(daysBetweenIso('2026-10-13', '2026-10-16')).toBe(3);
    expect(daysBetweenIso('2026-10-16', '2026-10-13')).toBe(-3);
    expect(daysBetweenIso('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenIso('2028-02-28', '2028-03-01')).toBe(2);
  });
});

describe('addDaysIso', () => {
  it('moves along the calendar either way', () => {
    expect(addDaysIso('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});
