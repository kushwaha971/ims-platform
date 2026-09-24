import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchCashbook } from './cashbookThunk';

import type { CashbookData, CashbookFilters } from '../types/cashbook.types';

/**
 * EXP-03 — the cashbook's one response, held whole. A cashbook is read as a
 * chain (every opening is the previous closing), so it is never patched: a
 * write anywhere in the range invalidates it and it is fetched again, which the
 * FRD calls cheap (EC-4) and which is the only way the chain stays true.
 */
export interface CashbookState {
  data: CashbookData | null;
  /** The request the data answers — `null` is the till-only request. */
  asked: CashbookFilters | null | undefined;
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: CashbookState = {
  data: null,
  asked: undefined,
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const sameAsk = (a: CashbookFilters | null | undefined, b: CashbookFilters | null): boolean => {
  if (a === undefined) return false;
  if (a === null || b === null) return a === b;
  return a.dateFrom === b.dateFrom && a.dateTo === b.dateTo && a.bucket === b.bucket;
};

const cashbookSlice = createSlice({
  name: 'cashbook',
  initialState,
  reducers: {
    /** A new range or bucket: the old figures go, they were about another question. */
    cashbookAsked(state, action: PayloadAction<CashbookFilters | null>) {
      if (sameAsk(state.asked, action.payload)) return;
      state.asked = action.payload as Draft<CashbookFilters> | null;
      state.data = null;
      state.status = 'loading';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<CashbookState>('cashbook')(builder);
    builder
      .addCase(fetchCashbook.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchCashbook.fulfilled, (state, action) => {
        if (!sameAsk(state.asked, action.meta.arg)) return;
        state.data = action.payload as Draft<CashbookData>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchCashbook.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { cashbookAsked } = cashbookSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof cashbookSlice> {}
}

const injected = cashbookSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectCashbookData = (state: RootState): CashbookData | null => slice$(state).data;
export const selectCashbookStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectCashbookError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectCashbookStale = (state: RootState): boolean => slice$(state).stale;
