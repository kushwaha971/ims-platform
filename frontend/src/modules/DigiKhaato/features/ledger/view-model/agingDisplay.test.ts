import {
  asOfProblem,
  bucketShares,
  bucketStatementHref,
  filtersFromQuery,
  oldestBucket,
  orderingFor,
  queryFromFilters,
  rowStatementHref,
  sortFromOrdering,
} from './agingDisplay';

const amounts = (a: string, b: string, c: string, d: string, total: string) => ({
  '0_30': a,
  '31_60': b,
  '61_90': c,
  '90_plus': d,
  total,
});

describe('the stacked bar', () => {
  it('splits a row into whole percentages that add up to exactly 100', () => {
    /** Four independent roundings give 99 or 101 and a bar that misses its track. */
    const shares = bucketShares(amounts('333.33', '333.33', '333.34', '0.00', '1000.00'));
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBe(100);
    expect(shares.map((s) => s.share)).toEqual([33, 33, 34, 0]);
  });

  it('never lets a bucket with money in it round away to nothing', () => {
    /** ₹5 of ₹10,000 is still owed, and a segment that vanishes says it is not. */
    const shares = bucketShares(amounts('9995.00', '0.00', '0.00', '5.00', '10000.00'));
    expect(shares.find((s) => s.bucket === '90_plus')?.share).toBe(1);
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBe(100);
  });

  it('draws nothing for a row of zeros rather than dividing by zero', () => {
    expect(
      bucketShares(amounts('0.00', '0.00', '0.00', '0.00', '0.00')).every((s) => s.share === 0)
    ).toBe(true);
  });
});

describe('the phone card line', () => {
  it('names the OLDEST bucket with money in it — the phone call', () => {
    expect(oldestBucket(amounts('400.00', '0.00', '0.00', '100.00', '500.00'))).toEqual({
      bucket: '90_plus',
      amount: '100.00',
    });
    expect(oldestBucket(amounts('400.00', '50.00', '0.00', '0.00', '450.00'))?.bucket).toBe(
      '31_60'
    );
    expect(oldestBucket(amounts('0.00', '0.00', '0.00', '0.00', '0.00'))).toBeNull();
  });
});

describe('every figure is a way into the statement (FR-4)', () => {
  it('opens a bucket as the statement window its entries fall in, counted from the as-of date', () => {
    expect(bucketStatementHref('p1', '31_60', '2026-09-23')).toBe(
      '/parties/p1/statement?preset=custom&to=2026-08-23&from=2026-07-25'
    );
  });

  it('leaves 90+ open at the start, because there is no oldest date to invent', () => {
    expect(bucketStatementHref('p1', '90_plus', '2026-09-23')).toBe(
      '/parties/p1/statement?preset=custom&to=2026-06-24'
    );
  });

  it('opens a row as the whole statement up to the as-of date', () => {
    expect(rowStatementHref('p1', '2026-03-31')).toBe(
      '/parties/p1/statement?preset=custom&to=2026-03-31'
    );
  });
});

describe('the filter lives in the URL', () => {
  const today = '2026-09-23';

  it('defaults to receivable, today, oldest-first, page one — and writes none of it back', () => {
    const filters = filtersFromQuery(new URLSearchParams(''), today);
    expect(filters).toEqual({
      kind: 'receivable',
      asOf: today,
      tag: null,
      ordering: '-90_plus',
      page: 1,
    });
    expect(queryFromFilters(filters, today)).toBe('');
  });

  it('round-trips a year-end payable view with a tag, so it can be sent to an accountant', () => {
    const query = 'type=payable&as_of=2026-03-31&tag=Camp+Area&ordering=name&page=2';
    const filters = filtersFromQuery(new URLSearchParams(query), today);
    expect(queryFromFilters(filters, today)).toBe(query);
  });

  it('ignores an ordering the report does not offer instead of sending it to a 400', () => {
    expect(filtersFromQuery(new URLSearchParams('ordering=balance'), today).ordering).toBe(
      '-90_plus'
    );
  });

  it('refuses a future as-of date before asking the server (§10)', () => {
    expect(asOfProblem('2026-09-24', today)).toBe('future');
    expect(asOfProblem(today, today)).toBeNull();
  });
});

describe('the grid headers sort both ways', () => {
  it('maps a column and a direction to the server ordering and back', () => {
    expect(orderingFor({ columnId: '90_plus', direction: 'desc' })).toBe('-90_plus');
    expect(orderingFor({ columnId: 'party', direction: 'asc' })).toBe('name');
    expect(orderingFor({ columnId: 'age', direction: 'asc' })).toBe('');
    expect(sortFromOrdering('-total')).toEqual({ columnId: 'total', direction: 'desc' });
  });
});
