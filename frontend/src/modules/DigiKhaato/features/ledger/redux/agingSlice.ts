import { createSlice, type WithSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLedgerAging, fetchLedgerSummary } from './agingThunk';

import type { AgingAmounts, AgingFilters, AgingRow, LedgerSummary } from '../types/aging.types';

/**
 * Part 19 §19.3.2 Shape B — the aging report.
 *
 * ── §19.3.9, for the tenth time and the second in a row ───────────────────
 * Route-local again: `/ledger/aging` is the only screen that reads this, and
 * the slice ships to every route because `store.ts` registers it statically.
 * The statement's slice made the qualitative version of this argument; this one
 * is the same argument with a second instance behind it, which is what turns an
 * observation into a pattern.
 */
export interface LedgerAgingState {
  rows: AgingRow[];
  totals: AgingAmounts | null;
  summary: LedgerSummary | null;
  asOf: string | null;
  cachedAt: string | null;
  page: number;
  pageSize: number;
  total: number;
  status: RequestStatus;
  summaryStatus: RequestStatus;
  error: ApiErrorShape | null;
  filters: AgingFilters | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LedgerAgingState = {
  rows: [],
  totals: null,
  summary: null,
  asOf: null,
  cachedAt: null,
  page: 1,
  pageSize: 25,
  total: 0,
  status: 'idle',
  summaryStatus: 'idle',
  error: null,
  filters: null,
  stale: false,
  staleUrgency: null,
};

const ledgerAgingSlice = createSlice({
  name: 'ledgerAging',
  initialState,
  reducers: {
    /**
     * The merchant changed the tab, the date, the tag or the sort.
     *
     * Rows are cleared rather than kept while the new page loads. An aging
     * report is read as a whole — the buckets, the totals and the as-of date
     * are one statement about one moment — and showing yesterday's rows under
     * today's totals for the length of a request is showing a figure that was
     * never true.
     */
    agingFiltersChanged(state, action: PayloadAction<AgingFilters>) {
      state.filters = action.payload as Draft<AgingFilters>;
      state.rows = [];
      state.totals = null;
      state.status = 'loading';
      state.error = null;
    },
    resetLedgerAging: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<LedgerAgingState>('ledgerAging')(builder);

    builder
      .addCase(fetchLedgerAging.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLedgerAging.fulfilled, (state, action) => {
        /* The late-response guard, keyed on the AS-OF and the TYPE rather than
           on a party id: this report has no single subject, and the two things
           that make one answer wrong for another question are the date it was
           computed at and which side of the book it is about. A payable page
           landing under the receivable tab would show a merchant their
           suppliers under the heading "You will get". */
        const asked = state.filters;
        if (asked && (asked.asOf !== action.payload.asOf || asked.kind !== action.payload.kind)) {
          return;
        }
        state.rows = action.payload.rows as Draft<AgingRow>[];
        state.totals = action.payload.totals as Draft<AgingAmounts>;
        state.asOf = action.payload.asOf;
        state.cachedAt = action.payload.cachedAt;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.total = action.payload.total;
        state.status = 'succeeded';
        state.error = null;
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLedgerAging.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchLedgerSummary.pending, (state) => {
        state.summaryStatus = 'loading';
      })
      .addCase(fetchLedgerSummary.fulfilled, (state, action) => {
        state.summary = action.payload as Draft<LedgerSummary>;
        state.summaryStatus = 'succeeded';
      })
      .addCase(fetchLedgerSummary.rejected, (state) => {
        /* No error state, and that is deliberate: the summary is two figures in
           a header above a report that has its own error strip. Two red panels
           for one failed page is a screen that looks broken twice. */
        state.summaryStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { agingFiltersChanged, resetLedgerAging } = ledgerAgingSlice.actions;

export const ledgerAgingReducer = ledgerAgingSlice.reducer;

// ── Lazy registration (CR-134) ───────────────────────────────────────────────
// Only the route that imports this module needs this state, so the reducer
// arrives with that route's chunk instead of with every page. `selectSlice`
// answers the initial state until the first action lands.

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof ledgerAgingSlice> {}
}

const injected = ledgerAgingSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectAgingRows = (state: RootState): readonly AgingRow[] => slice$(state).rows;
export const selectAgingTotals = (state: RootState): AgingAmounts | null => slice$(state).totals;
export const selectLedgerPosition = (state: RootState): LedgerSummary | null =>
  slice$(state).summary;
export const selectAgingStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectAgingError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectAgingAsOf = (state: RootState): string | null => slice$(state).asOf;
export const selectAgingCachedAt = (state: RootState): string | null => slice$(state).cachedAt;
/* Three primitives rather than one object: a selector that built a fresh
   `{ page, pageSize, total }` per call re-rendered the aging page on EVERY
   store update anywhere in the app (the component tests caught Redux warning
   about it seventeen times). `createSelector` would fix it too, and would put
   reselect on the app shell for one screen. */
export const selectAgingPage = (state: RootState): number => slice$(state).page;
export const selectAgingPageSize = (state: RootState): number => slice$(state).pageSize;
export const selectAgingTotal = (state: RootState): number => slice$(state).total;
export const selectAgingStale = (state: RootState): boolean => slice$(state).stale;
