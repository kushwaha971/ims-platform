import { resetAllFeatureState } from 'src/redux/actions';
import type { ApiErrorShape } from 'src/types/api.types';

import partyListReducer, {
  filtersChanged,
  pageChanged,
  sameQuery,
  selectionChanged,
  type PartyListState,
} from './partyListSlice';
import { fetchPartyList, type FetchPartyListResult } from './partyListThunk';

/**
 * R-RX-5 — every thunk handles all three lifecycle cases, and a reducer test is
 * where that is cheap to prove. Behaviour, not implementation (R-T-6).
 */
const initial = partyListReducer(undefined, { type: '@@init' }) as PartyListState;

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ramesh Traders',
  displayCode: 'C-001',
  mobile: '+919876543210',
  isCustomer: true,
  isSupplier: false,
  balance: '500.00',
  status: 'active' as const,
  lastActivityAt: '2026-09-18T10:00:00Z',
  tags: [],
};

const payload: FetchPartyListResult = {
  rows: [row],
  meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  // The Sprint 0 endpoint sends no totals block. The SERVICE sums the page it
  // has and labels it `page`; the slice no longer does arithmetic, because
  // `partyTotals()` reaches `decimal.js-light` and this slice is statically
  // registered, which put an 11 KB money library on every route in the product.
  totals: null,
  totalsScope: 'page',
  overLimit: null,
  mode: 'replace',
};

const fulfilled = (result: FetchPartyListResult = payload) => ({
  type: fetchPartyList.fulfilled.type,
  payload: result,
  meta: {
    arg: { params: initial.filters, mode: result.mode },
    requestId: 'r1',
    requestStatus: 'fulfilled',
  },
});

describe('partyListSlice', () => {
  it('starts in loading so the grid paints a skeleton, not an empty state', () => {
    expect(initial.status).toBe('loading');
    expect(initial.rows).toEqual([]);
  });

  it('shows the skeleton on a first load and keeps rows on a refresh', () => {
    const pending = {
      type: fetchPartyList.pending.type,
      meta: { arg: { params: initial.filters, mode: 'replace' }, requestId: 'r1' },
    };
    expect(partyListReducer(initial, pending).status).toBe('loading');

    const loaded = partyListReducer(initial, fulfilled());
    expect(partyListReducer(loaded, pending).status).toBe('refreshing');
    expect(partyListReducer(loaded, pending).rows).toHaveLength(1);
  });

  it('replaces rows on `replace` and appends on `append`', () => {
    const loaded = partyListReducer(initial, fulfilled());
    expect(loaded.rows).toHaveLength(1);
    expect(loaded.status).toBe('succeeded');

    const appended = partyListReducer(loaded, fulfilled({ ...payload, mode: 'append' }));
    expect(appended.rows).toHaveLength(2);

    const replaced = partyListReducer(appended, fulfilled());
    expect(replaced.rows).toHaveLength(1);
  });

  it('treats an aborted request as a superseded keystroke, not a failure', () => {
    const loaded = partyListReducer(initial, fulfilled());
    const aborted = partyListReducer(loaded, {
      type: fetchPartyList.rejected.type,
      payload: undefined,
      meta: { arg: { params: initial.filters, mode: 'replace' }, aborted: true, requestId: 'r2' },
    });
    expect(aborted.status).toBe('succeeded');
    expect(aborted.error).toBeNull();
  });

  it('stores the normalised error on a genuine failure', () => {
    const error: ApiErrorShape = {
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_7f3a91',
      status: 500,
      warnings: [],
    };
    const failed = partyListReducer(initial, {
      type: fetchPartyList.rejected.type,
      payload: error,
      meta: { arg: { params: initial.filters, mode: 'replace' }, aborted: false, requestId: 'r3' },
    });
    expect(failed.status).toBe('failed');
    expect(failed.error?.requestId).toBe('req_7f3a91');
  });

  describe('PTY-02 §9 — Loading and the stale-cache Error variant', () => {
    const error: ApiErrorShape = {
      code: 'network_error',
      message: 'No connection.',
      details: {},
      requestId: 'req_0001',
      status: 0,
      warnings: [],
    };
    const pendingFor = (params: typeof initial.filters) => ({
      type: fetchPartyList.pending.type,
      meta: { arg: { params, mode: 'replace' }, requestId: 'p' },
    });
    const rejectedFor = (params: typeof initial.filters) => ({
      type: fetchPartyList.rejected.type,
      payload: error,
      meta: { arg: { params, mode: 'replace' }, aborted: false, requestId: 'x' },
    });

    it('dims (refreshing) on a filter change but shows the skeleton on a page change', () => {
      /** Prevents page 1's names sitting dimmed under a page-2 request (§9). */
      const loaded = partyListReducer(initial, fulfilled());
      expect(loaded.rowsQuery).toEqual(initial.filters);

      expect(
        partyListReducer(loaded, pendingFor({ ...initial.filters, balance: 'owes_me' })).status
      ).toBe('refreshing');
      expect(partyListReducer(loaded, pendingFor({ ...initial.filters, page: 2 })).status).toBe(
        'loading'
      );
      // A page change that ALSO changes a filter is a filter change.
      expect(
        partyListReducer(loaded, pendingFor({ ...initial.filters, page: 2, q: 'ram' })).status
      ).toBe('refreshing');
    });

    it('keeps the rows as the saved list when the SAME query fails (FR-15)', () => {
      /** Prevents a failed re-entry refresh from wiping a list the store still holds. */
      const loaded = partyListReducer(initial, fulfilled());
      const failed = partyListReducer(loaded, rejectedFor(initial.filters));
      expect(failed.status).toBe('failed');
      expect(failed.showingSaved).toBe(true);
      expect(failed.rows).toHaveLength(1);
      // Retrying clears the flag while in flight; success keeps it clear.
      const retrying = partyListReducer(failed, pendingFor(initial.filters));
      expect(retrying.showingSaved).toBe(false);
      expect(partyListReducer(retrying, fulfilled()).showingSaved).toBe(false);
    });

    it('never offers the saved list for a DIFFERENT query, or with nothing saved', () => {
      /** Prevents "all parties" rows being shown under a "Settled" chip as its answer. */
      const loaded = partyListReducer(initial, fulfilled());
      const otherQuery = { ...initial.filters, balance: 'settled' as const };
      expect(partyListReducer(loaded, rejectedFor(otherQuery)).showingSaved).toBe(false);
      expect(partyListReducer(initial, rejectedFor(initial.filters)).showingSaved).toBe(false);
    });

    it('compares queries field by field, optionally ignoring the page', () => {
      expect(sameQuery(initial.filters, { ...initial.filters })).toBe(true);
      expect(sameQuery(initial.filters, { ...initial.filters, page: 3 })).toBe(false);
      expect(
        sameQuery(initial.filters, { ...initial.filters, page: 3 }, { ignorePage: true })
      ).toBe(true);
      expect(sameQuery(initial.filters, { ...initial.filters, tag: 'Camp Area' })).toBe(false);
    });
  });

  it('resets pagination on any filter change and keeps it on an explicit page change', () => {
    const paged = partyListReducer(initial, pageChanged({ page: 4 }));
    expect(paged.filters.page).toBe(4);
    expect(partyListReducer(paged, filtersChanged({ q: 'ram' })).filters.page).toBe(1);
  });

  it('caps the bulk selection', () => {
    const ids = Array.from({ length: 500 }, (_, index) => `id-${index}`);
    expect(partyListReducer(initial, selectionChanged(ids)).selectedIds).toHaveLength(200);
  });

  it('returns to initialState on the teardown signal', () => {
    const loaded = partyListReducer(initial, fulfilled());
    expect(partyListReducer(loaded, resetAllFeatureState())).toEqual(initial);
  });
});
