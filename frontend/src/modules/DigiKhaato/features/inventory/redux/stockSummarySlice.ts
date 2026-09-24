import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLowStock, fetchStockSummary } from './stockThunk';

import type { LowStockResult, StockSummaryFilters, StockSummaryResult } from '../types/item.types';

/** INV-07 `/stock/low` and INV-08 `/stock/summary`. Lazily injected (CR-134). */
export interface StockSummaryState {
  summary: StockSummaryResult | null;
  summaryFilters: StockSummaryFilters | null;
  summaryStatus: RequestStatus;
  summaryError: ApiErrorShape | null;
  low: LowStockResult | null;
  lowStatus: RequestStatus;
  lowError: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: StockSummaryState = {
  summary: null,
  summaryFilters: null,
  summaryStatus: 'idle',
  summaryError: null,
  low: null,
  lowStatus: 'idle',
  lowError: null,
  stale: false,
  staleUrgency: null,
};

const stockSummarySlice = createSlice({
  name: 'stockSummary',
  initialState,
  reducers: {
    summaryFiltersChanged(state, action: PayloadAction<StockSummaryFilters>) {
      state.summaryFilters = action.payload as Draft<StockSummaryFilters>;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<StockSummaryState>('stockSummary')(builder);
    builder
      .addCase(fetchStockSummary.pending, (state) => {
        state.summaryStatus = state.summary ? 'refreshing' : 'loading';
        state.summaryError = null;
      })
      .addCase(fetchStockSummary.fulfilled, (state, action) => {
        if (
          state.summaryFilters &&
          JSON.stringify(state.summaryFilters) !== JSON.stringify(action.meta.arg)
        ) {
          return;
        }
        state.summary = action.payload as Draft<StockSummaryResult>;
        state.summaryStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchStockSummary.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.summaryStatus = 'failed';
        state.summaryError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchLowStock.pending, (state) => {
        state.lowStatus = state.low ? 'refreshing' : 'loading';
        state.lowError = null;
      })
      .addCase(fetchLowStock.fulfilled, (state, action) => {
        state.low = action.payload as Draft<LowStockResult>;
        state.lowStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLowStock.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.lowStatus = 'failed';
        state.lowError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { summaryFiltersChanged } = stockSummarySlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof stockSummarySlice> {}
}

const injected = stockSummarySlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectStockSummary = (state: RootState): StockSummaryResult | null =>
  slice$(state).summary;
export const selectStockSummaryStatus = (state: RootState): RequestStatus =>
  slice$(state).summaryStatus;
export const selectStockSummaryError = (state: RootState): ApiErrorShape | null =>
  slice$(state).summaryError;
export const selectLowStock = (state: RootState): LowStockResult | null => slice$(state).low;
export const selectLowStockStatus = (state: RootState): RequestStatus => slice$(state).lowStatus;
export const selectLowStockError = (state: RootState): ApiErrorShape | null =>
  slice$(state).lowError;
export const selectStockSummaryStale = (state: RootState): boolean => slice$(state).stale;
