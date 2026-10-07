import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape } from 'src/types/api.types';

import { fetchProfitReport } from './profitReportThunk';

import type { ProfitFilters, ProfitPage, ProfitSliceState } from '../types/profitReport.types';

/**
 * Shop item 1 — the profit report, a lazily injected slice (CR-134): it ships
 * with `/reports/profit` and nowhere else.
 *
 * Every response is matched against the query asked LAST: a slow "by item"
 * answer arriving after the owner switched to "by customer" must not paint
 * item rows under the customer heading.
 */
const initialState: ProfitSliceState = { data: null, query: null, status: 'idle', error: null };

const sameQuery = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const profitReportSlice = createSlice({
  name: 'profitReport',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfitReport.pending, (state, action) => {
        const changed = !sameQuery(state.query, action.meta.arg);
        state.query = action.meta.arg as Draft<ProfitFilters>;
        // Rows AND totals clear together: a total over the previous filter was never true.
        if (changed) state.data = null;
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchProfitReport.fulfilled, (state, action) => {
        if (!sameQuery(state.query, action.meta.arg)) return;
        state.data = action.payload as Draft<ProfitPage>;
        state.status = 'succeeded';
      })
      .addCase(fetchProfitReport.rejected, (state, action) => {
        if (action.meta.aborted || !sameQuery(state.query, action.meta.arg)) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof profitReportSlice> {}
}

const injected = profitReportSlice.injectInto(rootReducer);

export const selectProfitReport = (state: RootState): ProfitSliceState =>
  injected.selectSlice(state);
