import { resetAllFeatureState } from 'src/redux/actions';
import type { ApiErrorShape } from 'src/types/api.types';

import partyListReducer, {
  filtersChanged,
  pageChanged,
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
