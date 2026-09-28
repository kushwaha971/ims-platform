import { nextMonthDay, periodFromQuery, periodToQuery, resolveTaxPeriod } from './taxPeriod';

/**
 * The GST periods. What these protect: a quarter is a quarter of the
 * FINANCIAL year (Q1 = April–June, so September's quarter starts in July and
 * January's in January), "this" periods stop at the tenant's today, and a
 * pasted link with a broken range falls back to the default rather than to an
 * empty report.
 */
describe('resolveTaxPeriod', () => {
  it.each([
    ['thisMonth', '2026-09-28', '2026-09-01', '2026-09-28'],
    ['lastMonth', '2026-09-28', '2026-08-01', '2026-08-31'],
    ['lastMonth', '2026-01-15', '2025-12-01', '2025-12-31'],
    ['thisQuarter', '2026-09-28', '2026-07-01', '2026-09-28'],
    ['thisQuarter', '2027-02-10', '2027-01-01', '2027-02-10'],
    ['thisQuarter', '2026-04-01', '2026-04-01', '2026-04-01'],
    ['lastQuarter', '2026-09-28', '2026-04-01', '2026-06-30'],
    ['lastQuarter', '2027-01-05', '2026-10-01', '2026-12-31'],
    ['lastQuarter', '2026-05-05', '2026-01-01', '2026-03-31'],
    ['thisFy', '2026-09-28', '2026-04-01', '2026-09-28'],
    ['thisFy', '2027-03-31', '2026-04-01', '2027-03-31'],
  ] as const)('%s on %s is %s … %s', (preset, today, from, to) => {
    expect(resolveTaxPeriod(preset, today)).toEqual({ dateFrom: from, dateTo: to });
  });

  it('leaves custom to the caller', () => {
    expect(resolveTaxPeriod('custom', '2026-09-28')).toBeNull();
  });
});

describe('periodFromQuery / periodToQuery', () => {
  it('round-trips a custom range and keeps a default preset out of the URL', () => {
    const search = new URLSearchParams();
    periodToQuery(
      search,
      { preset: 'custom', dateFrom: '2026-07-01', dateTo: '2026-07-31' },
      'thisMonth'
    );
    expect(search.toString()).toBe('period=custom&from=2026-07-01&to=2026-07-31');
    expect(periodFromQuery(search, '2026-09-28', 'thisMonth')).toEqual({
      preset: 'custom',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });
    const plain = new URLSearchParams();
    periodToQuery(plain, { preset: 'thisMonth', dateFrom: 'x', dateTo: 'y' }, 'thisMonth');
    expect(plain.toString()).toBe('');
  });

  it('falls back to the default for a reversed or malformed custom range', () => {
    const reversed = new URLSearchParams('period=custom&from=2026-09-10&to=2026-09-01');
    expect(periodFromQuery(reversed, '2026-09-28', 'lastMonth')).toEqual({
      preset: 'lastMonth',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });
    const junk = new URLSearchParams('period=fortnight');
    expect(periodFromQuery(junk, '2026-09-28', 'thisMonth').preset).toBe('thisMonth');
  });

  it('never lets a custom range end after today', () => {
    const future = new URLSearchParams('period=custom&from=2026-09-01&to=2026-12-31');
    expect(periodFromQuery(future, '2026-09-28', 'thisMonth').dateTo).toBe('2026-09-28');
  });
});

it('puts the GSTR-3B due date in the month after the period, across a year end', () => {
  expect(nextMonthDay('2026-09-30', 20)).toBe('2026-10-20');
  expect(nextMonthDay('2026-12-31', 11)).toBe('2027-01-11');
});
