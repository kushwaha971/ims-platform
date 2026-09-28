import {
  DEFAULT_PRESET,
  balanceDirection,
  balanceLabelId,
  filtersFromQuery,
  queryFromFilters,
  rangeProblem,
  resolvePreset,
  rowTitleId,
  unsigned,
} from './statementDisplay';

import type { StatementFilters, StatementRow } from '../types/statement.types';

/**
 * LED-04's presentation rules, tested where they live.
 *
 * The period maths is the part that cannot be checked by looking: a preset
 * resolves to two dates, the dates go into a URL, the URL comes back as a
 * filter, and every hop is somewhere a month boundary or a financial year can
 * be lost by one day.
 */

describe('which way a balance points', () => {
  it('turns a sign into a sentence', () => {
    /* BR-4, and the reason it is a named function rather than a ternary at four
       call sites: a shopkeeper has no concept of a negative balance. "Minus two
       thousand" is not something anyone says across a counter. */
    expect(balanceDirection('2500.00')).toBe('receivable');
    expect(balanceDirection('-2500.00')).toBe('payable');
    expect(balanceDirection('0.00')).toBe('settled');
  });

  it('calls a zero settled however it is spelled', () => {
    // The server sends "0.00"; a fixture, an older build or a hand-written test
    // sends "0", "-0.00" or "". All four mean the same thing to a merchant.
    for (const zero of ['0', '0.00', '-0.00', '', '  ']) {
      expect(balanceDirection(zero)).toBe('settled');
    }
  });

  it('strips the sign for display without touching the magnitude', () => {
    /* §23.2.6 rule 3 — the figure carries no sign and the LABEL carries the
       direction. `UbAmount` would otherwise print "−₹2,500.00 · You will give",
       which is the defect PTY-03 found on the khata header. */
    expect(unsigned('-2500.00')).toBe('2500.00');
    expect(unsigned('2500.00')).toBe('2500.00');
    expect(balanceLabelId('-1.00')).toBe('ledger.statement.label.payable');
  });
});

describe('the period presets', () => {
  it('reads "this year" as the FINANCIAL year, starting 1 April', () => {
    /* Not a preference and not configurable: it is the statutory year every
       Indian business files against, and it is the range a merchant means when
       they say "the year". A date library's default would give them January. */
    expect(resolvePreset('thisFy', '2026-09-23')).toEqual({
      dateFrom: '2026-04-01',
      dateTo: '2026-09-23',
    });
  });

  it('puts January in the financial year that began the previous April', () => {
    // The case a calendar-year assumption gets wrong, and gets wrong silently:
    // a statement pulled in January would show three months instead of ten.
    expect(resolvePreset('thisFy', '2027-01-15')).toEqual({
      dateFrom: '2026-04-01',
      dateTo: '2027-01-15',
    });
    expect(resolvePreset('lastFy', '2027-01-15')).toEqual({
      dateFrom: '2025-04-01',
      dateTo: '2026-03-31',
    });
  });

  it('ends "this year" today rather than on 31 March', () => {
    /* A financial year that has not finished has no closing figure yet, and a
       statement dated into the future shows a customer a period they have not
       lived through. */
    expect(resolvePreset('thisFy', '2026-06-01').dateTo).toBe('2026-06-01');
  });

  it('gives last month its own real length', () => {
    // February, and February in a leap year. A hard-coded 30 is wrong eight
    // months a year; a hard-coded 31 is wrong four.
    expect(resolvePreset('lastMonth', '2026-03-10')).toEqual({
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
    });
    expect(resolvePreset('lastMonth', '2028-03-10')).toEqual({
      dateFrom: '2028-02-01',
      dateTo: '2028-02-29',
    });
  });

  it('crosses the new year backwards without losing December', () => {
    expect(resolvePreset('lastMonth', '2027-01-05')).toEqual({
      dateFrom: '2026-12-01',
      dateTo: '2026-12-31',
    });
  });

  it('leaves "all time" unbounded, which is the range BR-3 checks', () => {
    /* The closing balance of an unbounded statement must equal the party's
       cached balance, and `null` is what the server reads as "from the
       beginning". A client that sent an early date instead would make the one
       checkable figure in this feature uncheckable. */
    expect(resolvePreset('allTime', '2026-09-23')).toEqual({ dateFrom: null, dateTo: null });
  });
});

describe('the filter and the address bar', () => {
  const today = '2026-09-23';

  it('defaults to this financial year when the URL says nothing', () => {
    const filters = filtersFromQuery(new URLSearchParams(''), today);

    expect(filters.preset).toBe(DEFAULT_PRESET);
    expect(filters.dateFrom).toBe('2026-04-01');
    expect(filters.includeCorrections).toBe(false);
  });

  it('treats a link carrying dates and no preset as custom', () => {
    /* What a pasted link looks like. Falling back to the default preset would
       throw away the dates the sender chose and show the recipient a different
       statement under the same URL. */
    const filters = filtersFromQuery(new URLSearchParams('from=2026-05-01&to=2026-05-31'), today);

    expect(filters.preset).toBe('custom');
    expect(filters.dateFrom).toBe('2026-05-01');
    expect(filters.dateTo).toBe('2026-05-31');
  });

  it('round-trips through the query string', () => {
    // PTY-05's lesson: the tag manager's count link was inert for a week
    // because the list read its filters from Redux and never from the URL.
    const original: StatementFilters = {
      preset: 'custom',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-31',
      includeCorrections: true,
    };

    const back = filtersFromQuery(new URLSearchParams(queryFromFilters(original)), today);

    expect(back).toEqual(original);
  });

  it('does not write dates a preset already implies', () => {
    /* A URL carrying `preset=thisFy&from=2026-04-01` goes stale on 1 April:
       the preset says "this year" and the dates say last year's, and the two
       disagree for anyone who opens the link after the boundary. */
    expect(
      queryFromFilters({
        preset: 'thisFy',
        dateFrom: '2026-04-01',
        dateTo: '2026-09-23',
        includeCorrections: false,
      })
    ).toBe('preset=thisFy');
  });

  it('ignores a preset it does not recognise', () => {
    // A hand-edited URL, or a link from a future build. Falling through to the
    // default is the honest answer; trusting it would resolve to no dates at all.
    expect(filtersFromQuery(new URLSearchParams('preset=lastDecade'), today).preset).toBe(
      DEFAULT_PRESET
    );
  });
});

describe('the range the client refuses before asking', () => {
  const base: StatementFilters = {
    preset: 'custom',
    dateFrom: null,
    dateTo: null,
    includeCorrections: false,
  };

  it('spots an inverted range', () => {
    expect(rangeProblem({ ...base, dateFrom: '2026-05-01', dateTo: '2026-04-01' })).toBe(
      'inverted'
    );
  });

  it('spots a range longer than five years', () => {
    /* §10. The server refuses it too, and that is not duplication for its own
       sake: this one saves the merchant a round trip, and the server's stops a
       client bug from asking for a scan of a tenant's whole history. */
    expect(rangeProblem({ ...base, dateFrom: '2015-01-01', dateTo: '2026-04-01' })).toBe('tooLong');
    expect(rangeProblem({ ...base, dateFrom: '2022-04-01', dateTo: '2026-04-01' })).toBeNull();
  });

  it('has nothing to say about an unbounded range', () => {
    expect(rangeProblem(base)).toBeNull();
    expect(rangeProblem({ ...base, dateFrom: '2026-04-01' })).toBeNull();
  });
});

describe('the particulars a row is titled by (D-L3)', () => {
  const row = (over: Partial<StatementRow>): StatementRow => ({
    id: 'r1',
    entryDate: '2026-04-01',
    entryType: 'manual_gave',
    direction: 'debit',
    amount: '100.00',
    note: '',
    status: 'posted',
    runningBalance: '100.00',
    source: null,
    reversesId: null,
    supersedesId: null,
    reason: null,
    ...over,
  });

  it('titles an opening row by its type even though the server stored an English note', () => {
    /* Prevents D-L3: the note "Opening balance" won over the type, so the row
       was English on a Hindi statement. */
    expect(rowTitleId(row({ entryType: 'opening', note: 'Opening balance' }))).toBe(
      'ledger.entry.type.opening'
    );
  });

  it('keeps the merchant’s own note as the title of any other row', () => {
    expect(rowTitleId(row({ note: 'Cement bags' }))).toBeNull();
  });

  it('falls back to the type’s words when a row has no note', () => {
    expect(rowTitleId(row({ entryType: 'manual_got', direction: 'credit' }))).toBe(
      'ledger.entry.type.manual_got'
    );
  });
});
