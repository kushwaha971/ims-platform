import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape } from 'src/types/api.types';

import { fetchGstSummary, fetchRegister } from './taxReportsThunk';

import type {
  GstQuery,
  GstSummary,
  RegisterBook,
  RegisterPage,
  RegisterQuery,
  ReportSliceState,
} from '../types/taxReports.types';

/**
 * RPT-03 / RPT-04 / RPT-07 — the three tax-document reports, one lazily
 * injected slice (CR-134): it ships with the report routes and nowhere else.
 *
 * State is keyed by report, and every response is matched against the query
 * that was ASKED LAST: a slow September answer arriving after the merchant
 * moved to October must not paint September's totals under October's title.
 */
export interface TaxReportsState {
  readonly sales: ReportSliceState<RegisterPage, RegisterQuery>;
  readonly purchase: ReportSliceState<RegisterPage, RegisterQuery>;
  readonly gst: ReportSliceState<GstSummary, GstQuery>;
}

const empty = { data: null, query: null, status: 'idle', error: null } as const;
const initialState: TaxReportsState = { sales: empty, purchase: empty, gst: empty };

const sameQuery = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const taxReportsSlice = createSlice({
  name: 'taxReports',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRegister.pending, (state, action) => {
        const book: RegisterBook = action.meta.arg.book;
        const slot = state[book];
        const changed = !sameQuery(slot.query, action.meta.arg);
        slot.query = action.meta.arg as Draft<RegisterQuery>;
        // Rows AND totals clear together: a total over the previous filter was never true.
        if (changed) slot.data = null;
        slot.status = slot.data ? 'refreshing' : 'loading';
        slot.error = null;
      })
      .addCase(fetchRegister.fulfilled, (state, action) => {
        const slot = state[action.meta.arg.book];
        if (!sameQuery(slot.query, action.meta.arg)) return;
        slot.data = action.payload as Draft<RegisterPage>;
        slot.status = 'succeeded';
      })
      .addCase(fetchRegister.rejected, (state, action) => {
        if (action.meta.aborted) return;
        const slot = state[action.meta.arg.book];
        if (!sameQuery(slot.query, action.meta.arg)) return;
        slot.status = 'failed';
        slot.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchGstSummary.pending, (state, action) => {
        const changed = !sameQuery(state.gst.query, action.meta.arg);
        state.gst.query = action.meta.arg;
        if (changed) state.gst.data = null;
        state.gst.status = state.gst.data ? 'refreshing' : 'loading';
        state.gst.error = null;
      })
      .addCase(fetchGstSummary.fulfilled, (state, action) => {
        if (!sameQuery(state.gst.query, action.meta.arg)) return;
        state.gst.data = action.payload as Draft<GstSummary>;
        state.gst.status = 'succeeded';
      })
      .addCase(fetchGstSummary.rejected, (state, action) => {
        if (action.meta.aborted || !sameQuery(state.gst.query, action.meta.arg)) return;
        state.gst.status = 'failed';
        state.gst.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const taxReportsReducer = taxReportsSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof taxReportsSlice> {}
}

const injected = taxReportsSlice.injectInto(rootReducer);

export const selectRegisterReport = (
  state: RootState,
  book: RegisterBook
): TaxReportsState[RegisterBook] => injected.selectSlice(state)[book];

export const selectGstReport = (state: RootState): TaxReportsState['gst'] =>
  injected.selectSlice(state).gst;
