import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import { DEFAULT_ORDERING, DEFAULT_PAGE_SIZE, SELECTION_CAP } from '../constants/partyListDefaults';

/* From `constants/`, NOT from `../view-model/partyDisplay` — importing the
 * totals type from beside `partyTotals()` pulls `decimal.js-light` into the app
 * shell, because this slice is statically registered (§19.3.9). See
 * `constants/partyListDefaults.ts` for the measurement. */
import { fetchPartyList } from './partyListThunk';

import type { PartyListTotals } from '../constants/partyListDefaults';
import type { Party, PartyListFilters } from '../types/party.types';

/**
 * Part 19 §19.3.2 Shape A — a list slice. Slice name = file name = store key
 * (R-RX-1), selectors co-located at the bottom and exported by name (R-RX-3),
 * `status` a discriminated union rather than a bag of booleans (R-TS-4), and
 * `error` the normalised serialisable `ApiErrorShape` (R-RX-10).
 */
export interface PartyListState {
  rows: Party[];
  meta: PageMeta;
  filters: PartyListFilters;
  status: RequestStatus;
  error: ApiErrorShape | null;
  selectedIds: string[];
  /**
   * The two figures the sticky header shows at every width. They are STATE
   * rather than a selector over `rows` because the server can send totals for
   * the whole filtered set, and a page-sum is only the fallback.
   */
  /** The server's figures, or `null` when it sent none and the page is summed
   *  on the screen instead. */
  totals: PartyListTotals | null;
  /**
   * Which set `totals` describes. The header says so out loud: a merchant told
   * "You will get ₹1,24,300" has to be able to trust that it is not the sum of
   * the twenty-five rows that happened to load.
   */
  totalsScope: 'filtered' | 'page';
  /**
   * PTY-06 FR-12 — how many matched parties are over their credit limit, or
   * null when the server did not count. The chip is drawn from this and only
   * when it is above zero: a permanently visible "Over limit (0)" is a control
   * whose only outcome is an empty list, on a screen that already has seven.
   */
  overLimit: number | null;
  lastFetchedAt: number | null;
  /**
   * The query `rows` answer — the params of the request that last SUCCEEDED.
   *
   * Two PTY-02 §9 states hang off it. A PAGE change (same query, another page)
   * shows the skeleton, because page 2's rows are not page 1's dimmed; any
   * other change keeps the old rows dimmed under a progress bar. And a failed
   * request whose query is the one `rows` already answer keeps them on screen
   * as the saved list (FR-15) instead of swapping them for the error state —
   * while a failed request for a DIFFERENT query still shows the error, because
   * rows for "Settled" under an "Owes me" chip would be a list that lies.
   */
  rowsQuery: PartyListFilters | null;
  /**
   * FR-15 / §9 Error, stale-cache variant: the last request failed, and `rows`
   * are the saved answer to the very query that failed. The screen shows them
   * under a "Showing saved list · Try again" banner rather than the error state.
   */
  showingSaved: boolean;
  /** Set by the invalidation listener (§19.3.6); the hook refetches on it. */
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

/**
 * The unfiltered list, and the baseline the URL is written against.
 *
 * Exported because `usePartyListUrl` omits any axis that still holds its
 * default, so an untouched list has a clean `/parties` and a shared link
 * carries only what the sender actually chose. A second copy of these values
 * over there would be a second thing to keep true.
 */
export const DEFAULT_PARTY_FILTERS: PartyListFilters = {
  q: '',
  status: 'active',
  type: '',
  balance: '',
  collection: '',
  tag: '',
  credit: '',
  ordering: DEFAULT_ORDERING,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const initialState: PartyListState = {
  rows: [],
  meta: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
  filters: DEFAULT_PARTY_FILTERS,
  // Start in 'loading' so the grid paints its skeleton on first render rather
  // than flashing an empty state before the first request resolves.
  status: 'loading',
  error: null,
  selectedIds: [],
  totals: null,
  totalsScope: 'page',
  overLimit: null,
  lastFetchedAt: null,
  rowsQuery: null,
  showingSaved: false,
  stale: false,
  staleUrgency: null,
};

/**
 * Whether two queries ask for the same rows. `PartyListFilters` is flat and
 * every value is a primitive, so a key-by-key comparison is exact; `ignorePage`
 * asks whether they differ ONLY by page.
 */
export const sameQuery = (
  a: PartyListFilters,
  b: PartyListFilters,
  { ignorePage = false }: { readonly ignorePage?: boolean } = {}
): boolean =>
  (Object.keys(a) as (keyof PartyListFilters)[]).every(
    (key) => (ignorePage && key === 'page') || a[key] === b[key]
  );

const partyListSlice = createSlice({
  name: 'partyList',
  initialState,
  reducers: {
    /** Any filter change resets pagination — shared UX rule §17.0.3. */
    filtersChanged(state, action: PayloadAction<Partial<PartyListFilters>>) {
      state.filters = { ...state.filters, ...action.payload, page: 1 };
      state.selectedIds = [];
    },
    pageChanged(state, action: PayloadAction<{ page: number; pageSize?: number }>) {
      state.filters.page = action.payload.page;
      if (action.payload.pageSize) state.filters.pageSize = action.payload.pageSize;
    },
    /**
     * Everything except `status`, which survives on purpose.
     *
     * "Clear filters" on the Archived tab must not silently move the merchant
     * back to Active — they would be looking at a different set of people and
     * the only thing that changed on screen is that the rows are different.
     * The tab is where they ARE; the chips are what they asked of it.
     */
    filtersCleared(state) {
      state.filters = { ...DEFAULT_PARTY_FILTERS, status: state.filters.status };
      state.selectedIds = [];
    },
    selectionChanged(state, action: PayloadAction<string[]>) {
      state.selectedIds = action.payload.slice(0, SELECTION_CAP);
    },
    resetPartyList: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<PartyListState>('partyList')(builder);

    builder
      .addCase(fetchPartyList.pending, (state, action) => {
        const { params, mode } = action.meta.arg;
        /* PTY-02 §9 Loading: "subsequent loads keep the previous rows at 60 %
           opacity with a top MLProgress; page changes replace rows with
           skeletons." A page change is the same query at another page — the
           old page's rows are not a preview of the new one, so dimming them
           would show the merchant names that are about to vanish. */
        const pageChange =
          state.rowsQuery !== null &&
          state.rowsQuery.page !== params.page &&
          sameQuery(state.rowsQuery, params, { ignorePage: true });
        state.status =
          mode === 'append'
            ? 'refreshing'
            : state.rows.length === 0 || pageChange
              ? 'loading'
              : 'refreshing';
        state.error = null;
        state.showingSaved = false;
      })
      .addCase(fetchPartyList.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // The cast is the same one `error` below needs, for the same reason:
        // Immer's `Draft<T>` cannot hold a `readonly` array, and `Party.tags`
        // is readonly by contract (R-TS-5). Rows are replaced wholesale here
        // and never mutated in place, so nothing is being smuggled past the
        // type system — the array the reducer assigns was built one line above.
        state.rows = (
          action.payload.mode === 'append'
            ? [...state.rows, ...action.payload.rows]
            : [...action.payload.rows]
        ) as Draft<Party>[];
        state.meta = action.payload.meta;
        // NO ARITHMETIC IN THE REDUCER. Summing the page here meant importing
        // `partyTotals()`, which reaches `utils/money`, which is
        // `decimal.js-light` — and every slice `store.ts` registers statically
        // is in the app shell (§19.3.9), so `/legal/terms` and `/login` were
        // downloading an 11 KB money library to render a paragraph of text.
        // Measured saving, with this and the totals type moved out of the
        // view-model: app shell 101.1 -> 94.4 KB gz on EVERY route.
        //
        // The page sum now happens in `usePartyList`, which is route-local, so
        // the arithmetic travels with the screen that does arithmetic.
        state.totals = action.payload.totals;
        state.totalsScope = action.payload.totalsScope;
        state.overLimit = action.payload.overLimit;
        state.lastFetchedAt = Date.now();
        state.rowsQuery = { ...action.meta.arg.params };
        state.showingSaved = false;
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPartyList.rejected, (state, action) => {
        // An aborted request is a superseded keystroke, not a failure.
        if (action.meta.aborted) return;
        state.status = 'failed';
        // Immer's Draft<T> cannot hold a readonly array and ApiErrorShape's
        // `details` is readonly by contract (R-TS-5). The object is frozen by
        // `toApiError` and never mutated in the store, so the cast is safe.
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        // FR-15 — keep the saved rows only when they answer the query that failed.
        state.showingSaved =
          state.rows.length > 0 &&
          state.rowsQuery !== null &&
          sameQuery(state.rowsQuery, action.meta.arg.params);
      })
      // Logout and tenant switch clear every feature slice (§19.6.5).
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { filtersChanged, pageChanged, filtersCleared, selectionChanged, resetPartyList } =
  partyListSlice.actions;

export default partyListSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectPartyRows = (state: RootState): readonly Party[] => state.partyList.rows;
export const selectPartyListMeta = (state: RootState): PageMeta => state.partyList.meta;
export const selectPartyFilters = (state: RootState): PartyListFilters => state.partyList.filters;
export const selectPartyListStatus = (state: RootState): RequestStatus => state.partyList.status;
export const selectPartyListError = (state: RootState): ApiErrorShape | null =>
  state.partyList.error;
export const selectPartySelection = (state: RootState): readonly string[] =>
  state.partyList.selectedIds;
export const selectPartyListStale = (state: RootState): boolean => state.partyList.stale;
export const selectPartyListTotals = (state: RootState): PartyListTotals | null =>
  state.partyList.totals;
export const selectPartyListTotalsScope = (state: RootState): 'filtered' | 'page' =>
  state.partyList.totalsScope;
export const selectPartyOverLimit = (state: RootState): number | null => state.partyList.overLimit;
export const selectPartyListShowingSaved = (state: RootState): boolean =>
  state.partyList.showingSaved;
