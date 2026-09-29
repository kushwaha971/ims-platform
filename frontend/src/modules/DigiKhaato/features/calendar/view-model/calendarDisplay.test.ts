import {
  groupByMonth,
  lastOpenDay,
  moduleName,
  nextTwelveMonths,
  toggleWeekday,
} from './calendarDisplay';

/**
 * A9b (PLT-X08) — the Business days screen's pure rules. BR-2 matters most:
 * a calendar closed every weekday makes every due date impossible, so the
 * screen must never be able to send one.
 */
describe('calendarDisplay', () => {
  it('toggles a weekday and keeps the list sorted', () => {
    expect(toggleWeekday([6], 0)).toEqual([0, 6]);
    expect(toggleWeekday([0, 6], 6)).toEqual([0]);
  });

  it('refuses to close the seventh day (BR-2)', () => {
    expect(toggleWeekday([0, 1, 2, 3, 4, 5], 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lastOpenDay([0, 1, 2, 3, 4, 5])).toBe(6);
    expect(lastOpenDay([6])).toBeNull();
  });

  it('groups closures by month in date order', () => {
    const rows = [
      { id: 'b', date: '2026-11-08', reason: 'Diwali', module: null },
      { id: 'a', date: '2026-10-12', reason: 'Local', module: null },
      { id: 'c', date: '2026-10-02', reason: 'Gandhi Jayanti', module: 'library' as const },
    ];
    expect(groupByMonth(rows).map((g) => [g.month, g.rows.map((r) => r.id)])).toEqual([
      ['2026-10', ['c', 'a']],
      ['2026-11', ['b']],
    ]);
  });

  it('names a module in words, or not at all — never by its code', () => {
    // A fallback word spliced into "{module} uses different days" read as
    // "When on, This feature is closed…" on the look pass; a module without a
    // name here gets whole generic sentences instead (null → generic key).
    const t = (id: string): string => ({ 'nav.module.library': 'Library' })[id] ?? id;
    expect(moduleName(t, 'library')).toBe('Library');
    expect(moduleName(t, 'gym')).toBeNull();
  });

  it('reads today and the next twelve months, within the server limit of 400 days', () => {
    expect(nextTwelveMonths('2026-10-01')).toEqual({ from: '2026-10-01', to: '2027-10-01' });
  });
});
