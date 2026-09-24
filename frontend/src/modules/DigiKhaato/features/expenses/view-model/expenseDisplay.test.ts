import {
  cashbookFiltersFromQuery,
  cashbookQueryFromFilters,
  categoryLabel,
  countDifference,
  expenseFiltersFromQuery,
  expenseQueryFromFilters,
  isNarrowed,
  modeLabelId,
  resolveExpensePreset,
  shareOf,
} from './expenseDisplay';

/**
 * The expense screens' pure rules. Each block names the defect it prevents.
 */
const TODAY = '2026-09-24'; // a Thursday

describe('resolveExpensePreset', () => {
  it('resolves against the tenant day passed in, never the device clock', () => {
    /* A phone on UTC at 11.50 p.m. IST would otherwise put "Today" on the
       wrong day and the merchant's tea on yesterday's page. */
    expect(resolveExpensePreset('today', TODAY)).toEqual({ dateFrom: TODAY, dateTo: TODAY });
    expect(resolveExpensePreset('yesterday', TODAY)).toEqual({
      dateFrom: '2026-09-23',
      dateTo: '2026-09-23',
    });
  });

  it('starts the week on Monday', () => {
    expect(resolveExpensePreset('thisWeek', TODAY)).toEqual({
      dateFrom: '2026-09-21',
      dateTo: TODAY,
    });
    // A Sunday belongs to the week that began six days earlier, not to a new one.
    expect(resolveExpensePreset('thisWeek', '2026-09-27')?.dateFrom).toBe('2026-09-21');
  });

  it("shares the statement's month and financial-year arithmetic", () => {
    // April is the start of India's FY; a second copy of that rule could disagree.
    expect(resolveExpensePreset('thisFy', TODAY)).toEqual({
      dateFrom: '2026-04-01',
      dateTo: TODAY,
    });
    expect(resolveExpensePreset('lastMonth', TODAY)).toEqual({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });
    expect(resolveExpensePreset('custom', TODAY)).toBeNull();
  });
});

describe('the list filters in the address bar', () => {
  it('round-trips every filter, so a pasted link shows the same list', () => {
    /* PTY-05's defect: filters that live only in Redux make every link to a
       filtered list inert. */
    const filters = expenseFiltersFromQuery(
      new URLSearchParams(
        'period=custom&from=2026-09-01&to=2026-09-10&tab=unpaid&category=c1&mode=upi&q=rent&page=2'
      ),
      TODAY
    );
    expect(filters).toEqual({
      preset: 'custom',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-10',
      tab: 'unpaid',
      categoryId: 'c1',
      mode: 'upi',
      q: 'rent',
      page: 2,
    });
    expect(
      expenseFiltersFromQuery(new URLSearchParams(expenseQueryFromFilters(filters)), TODAY)
    ).toEqual(filters);
  });

  it('keeps the plain list at a plain URL and ignores values it does not know', () => {
    const plain = expenseFiltersFromQuery(new URLSearchParams('tab=deleted&mode=barter'), TODAY);
    expect(plain.preset).toBe('thisMonth');
    expect(plain.tab).toBe('all');
    expect(plain.mode).toBeNull();
    expect(expenseQueryFromFilters(plain)).toBe('');
    expect(isNarrowed(plain)).toBe(false);
    expect(isNarrowed({ ...plain, q: 'tea' })).toBe(true);
  });

  it('reads the cashbook range and bucket the same way', () => {
    const filters = cashbookFiltersFromQuery(
      new URLSearchParams('period=today&bucket=cash'),
      TODAY
    );
    expect(filters).toEqual({ preset: 'today', dateFrom: TODAY, dateTo: TODAY, bucket: 'cash' });
    expect(cashbookQueryFromFilters(filters)).toBe('period=today&bucket=cash');
  });
});

describe('countDifference — close the day', () => {
  it('says short, extra or matches, in decimal arithmetic', () => {
    /* Floats would turn 0.10 + 0.20 into "Short by ₹0.30000000000000004" on
       the one screen a shopkeeper reads at closing time. */
    expect(countDifference('18260.00', '18140')).toEqual({ kind: 'short', amount: '120.00' });
    expect(countDifference('18260.00', '18300.00')).toEqual({ kind: 'extra', amount: '40.00' });
    expect(countDifference('0.30', '0.3')).toEqual({ kind: 'matches', amount: '0.00' });
    expect(countDifference('-488.00', '0')).toEqual({ kind: 'extra', amount: '488.00' });
  });

  it('stays silent until something is counted', () => {
    expect(countDifference('100.00', '')).toBeNull();
  });
});

describe('labels', () => {
  it('names the UPI app the money went through, as the ledger does', () => {
    expect(modeLabelId('upi', 'phonepe')).toBe('ledger.upiApp.phonepe');
    expect(modeLabelId('upi', null)).toBe('ledger.mode.upi');
    // An unpaid expense has no "how" yet.
    expect(modeLabelId(null, null)).toBeNull();
  });

  it('suffixes a category archived after the expense (EXP-02 EC-5)', () => {
    expect(categoryLabel({ name: 'Marketing', status: 'archived' }, '(archived)')).toBe(
      'Marketing (archived)'
    );
    expect(categoryLabel({ name: 'Rent', status: 'active' }, '(archived)')).toBe('Rent');
  });

  it('rounds a share to a whole percent and never divides by zero', () => {
    expect(shareOf('5000.00', '5890.00')).toBe(85);
    expect(shareOf('10.00', '0.00')).toBe(0);
  });
});
