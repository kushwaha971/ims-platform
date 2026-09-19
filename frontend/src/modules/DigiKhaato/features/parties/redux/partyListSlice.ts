import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import { DEFAULT_ORDERING, DEFAULT_PAGE_SIZE, SELECTION_CAP } from '../constants/partyListDefaults';
import { partyTotals, ZERO_TOTALS, type PartyListTotals } from '../view-model/partyDisplay';

import { fetchPartyList } from './partyListThunk';

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
  totals: PartyListTotals;
  /**
   * Which set `totals` describes. The header says so out loud: a merchant told
   * "You will get ₹1,24,300" has to be able to trust that it is not the sum of
   * the twenty-five rows that happened to load.
   */
  totalsScope: 'filtered' | 'page';
  lastFetchedAt: number | null;
  /** Set by the invalidation listener (§19.3.6); the hook refetches on it. */
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialFilters: PartyListFilters = {
  q: '',
  status: 'active',
  ordering: DEFAULT_ORDERING,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const initialState: PartyListState = {
  rows: [],
  meta: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
  filters: initialFilters,
  // Start in 'loading' so the grid paints its skeleton on first render rather
  // than flashing an empty state before the first request resolves.
  status: 'loading',
  error: null,
  selectedIds: [],
  totals: ZERO_TOTALS,
  totalsScope: 'page',
  lastFetchedAt: null,
  stale: false,
  staleUrgency: null,
};

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
    filtersCleared(state) {
      state.filters = { ...initialFilters, status: state.filters.status };
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
        // A background refresh keeps rows visible; a replace shows the skeleton.
        state.status =
          action.meta.arg.mode === 'append' || state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPartyList.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rows =
          action.payload.mode === 'append'
            ? [...state.rows, ...action.payload.rows]
            : [...action.payload.rows];
        state.meta = action.payload.meta;
        state.totals = action.payload.totals ?? partyTotals(state.rows);
        state.totalsScope = action.payload.totals ? 'filtered' : 'page';
        state.lastFetchedAt = Date.now();
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
export const selectPartyListTotals = (state: RootState): PartyListTotals => state.partyList.totals;
export const selectPartyListTotalsScope = (state: RootState): 'filtered' | 'page' =>
  state.partyList.totalsScope;
