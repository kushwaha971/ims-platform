import { API_PATHS } from 'src/api/APIPaths';
import { api } from 'src/api/AxiosInstances';

import { getStatement, statementCsvUrl } from './statementService';

import type { StatementFilters } from '../types/statement.types';

/**
 * The statement boundary, tested on what it SENDS.
 *
 * `e2e/parties.mjs` exists because a set of chips validated, rendered and saved
 * with a 201 while the service silently dropped every one of them. A period the
 * merchant chose and the service did not send is the same defect on the screen
 * a customer reads.
 */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const mockApi = api as unknown as { get: jest.Mock };
const PARTY = '11111111-1111-4111-8111-111111111111';

const filters = (over: Partial<StatementFilters> = {}): StatementFilters => ({
  preset: 'thisFy',
  dateFrom: '2026-04-01',
  dateTo: '2026-09-23',
  includeCorrections: false,
  ...over,
});

const WIRE = {
  data: {
    party: { id: PARTY, name: 'Ramesh Traders', mobile_masked: '98••• ••210' },
    period: { from: '2026-04-01', to: '2026-09-23' },
    opening_balance: '2300.00',
    closing_balance: '2500.00',
    totals: { debit: '2800.00', credit: '300.00' },
    has_entries_before_opening: false,
    rows: [
      {
        id: 'r1',
        entry_date: '2026-09-18',
        entry_type: 'manual_gave',
        direction: 'debit',
        amount: '500.00',
        note: 'Cement bags',
        status: 'posted',
        running_balance: '2800.00',
        source: null,
        reverses_id: null,
        supersedes_id: null,
        reason: null,
      },
    ],
  },
  meta: { next_cursor: 'abc', has_more: true },
};

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.get.mockResolvedValue({ data: WIRE });
});

describe('asking for a statement', () => {
  it('sends the resolved dates and never the preset', async () => {
    /* A preset resolved on the client and re-resolved on the server disagrees
       across midnight: "This month" on a phone set to UTC at 11.50 p.m. IST is
       a different month from the tenant's. The dates are the contract. */
    await getStatement(PARTY, filters());

    const [url] = mockApi.get.mock.calls[0] as [string];
    expect(url).toContain(API_PATHS.PARTY_STATEMENT(PARTY));
    expect(url).toContain('date_from=2026-04-01');
    expect(url).toContain('date_to=2026-09-23');
    expect(url).not.toContain('preset');
  });

  it('omits the dates entirely for an unbounded period', async () => {
    // BR-3's range: the one whose closing balance must equal the khata page's
    // figure. An early date instead of nothing would make it uncheckable.
    await getStatement(PARTY, filters({ preset: 'allTime', dateFrom: null, dateTo: null }));

    const [url] = mockApi.get.mock.calls[0] as [string];
    expect(url).not.toContain('date_from');
    expect(url).not.toContain('date_to');
  });

  it('asks for corrections only when the switch is on', async () => {
    await getStatement(PARTY, filters());
    await getStatement(PARTY, filters({ includeCorrections: true }));

    expect(mockApi.get.mock.calls[0]?.[0]).not.toContain('include_corrections');
    expect(mockApi.get.mock.calls[1]?.[0]).toContain('include_corrections=true');
  });

  it('keeps every money value a string, running balance included', async () => {
    /* R-TS-7, and the running balance is the one that would hurt most: it is a
       CUMULATIVE figure, so a rounding error introduced at the boundary
       compounds down the page rather than staying on one row. */
    const page = await getStatement(PARTY, filters());

    expect(page.rows[0]?.runningBalance).toBe('2800.00');
    expect(page.summary.openingBalance).toBe('2300.00');
    expect(typeof page.rows[0]?.amount).toBe('string');
  });

  it('maps the header figures and the cursor', async () => {
    const page = await getStatement(PARTY, filters());

    expect(page.summary).toEqual({
      openingBalance: '2300.00',
      closingBalance: '2500.00',
      totalDebit: '2800.00',
      totalCredit: '300.00',
      hasEntriesBeforeOpening: false,
    });
    expect(page.party.mobileMasked).toBe('98••• ••210');
    expect(page.nextCursor).toBe('abc');
    expect(page.hasMore).toBe(true);
  });

  it('maps the written-off totals when the server sends them (CR-2026-09-24-A)', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        ...WIRE,
        data: {
          ...WIRE.data,
          totals: {
            debit: '2800.00',
            credit: '300.00',
            written_off: { debit: '0.00', credit: '2500.00' },
          },
        },
      },
    });

    const page = await getStatement(PARTY, filters());

    expect(page.summary.totalCredit).toBe('300.00');
    expect(page.summary.writtenOff).toEqual({ debit: '0.00', credit: '2500.00' });
  });
});

describe('the CSV address', () => {
  it('carries the same period as the statement on screen', () => {
    /* The export is the thing the merchant is LOOKING at, in a file. A URL that
       dropped the filter would hand an accountant the whole book when they
       asked for one month. */
    const url = statementCsvUrl(PARTY, filters({ includeCorrections: true }));

    expect(url).toContain('date_from=2026-04-01');
    expect(url).toContain('include_corrections=true');
    expect(url).toContain('format=csv');
  });

  it('is still a valid query when the period is unbounded', () => {
    // The case that produces an empty query string, where a naive `&format=csv`
    // yields `...statement&format=csv` — a parameter the server never sees.
    const url = statementCsvUrl(PARTY, filters({ dateFrom: null, dateTo: null }));

    expect(url).toContain('?format=csv');
    expect(url).not.toContain('&format=csv');
  });

  it('points at the API origin, not the page', () => {
    /* A relative href resolves against the FRONTEND, where the statement's
       path is the statement PAGE — the download saved HTML (found by
       e2e/aging.mjs, which clicks the link rather than fetching the API). */
    expect(statementCsvUrl(PARTY, filters())).toMatch(/^https?:\/\//);
  });
});
