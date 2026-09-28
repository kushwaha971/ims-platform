import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { INVOICE_PAGE_SIZE } from '../constants/salesConstants';

import { fetchFlowDocuments, type FlowListArg } from './salesFlowThunk';

import type { InvoiceListRow, InvoiceListTotals } from '../types/sales.types';

/**
 * SAL-01 FR-10 / SAL-04 §14 — the estimates and credit notes lists. One slice
 * for both, because one is on screen at a time and the shape is SAL-08's; the
 * KIND is part of the filters, so a response for the other list is dropped.
 * Route-local, so it is injected lazily (CR-134).
 */
export interface SalesDocListState {
  rows: InvoiceListRow[];
  totals: InvoiceListTotals | null;
  tabs: Readonly<Record<string, number>> | null;
  page: number;
  pageSize: number;
  total: number;
  status: RequestStatus;
  error: ApiErrorShape | null;
  filters: FlowListArg | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: SalesDocListState = {
  rows: [],
  totals: null,
  tabs: null,
  page: 1,
  pageSize: INVOICE_PAGE_SIZE,
  total: 0,
  status: 'idle',
  error: null,
  filters: null,
  stale: false,
  staleUrgency: null,
};

const same = (a: FlowListArg | null, b: FlowListArg): boolean =>
  !!a &&
  a.kind === b.kind &&
  a.tab === b.tab &&
  a.dateFrom === b.dateFrom &&
  a.dateTo === b.dateTo &&
  a.partyId === b.partyId &&
  a.q === b.q &&
  a.page === b.page;

const salesDocListSlice = createSlice({
  name: 'salesDocList',
  initialState,
  reducers: {
    /** Rows AND totals clear together — a total over another filter's rows was never true. */
    flowFiltersChanged(state, action: PayloadAction<FlowListArg>) {
      if (same(state.filters, action.payload)) return;
      state.filters = action.payload as Draft<FlowListArg>;
      state.rows = [];
      state.totals = null;
      state.tabs = null;
      state.status = 'loading';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<SalesDocListState>('salesDocList')(builder);
    builder
      .addCase(fetchFlowDocuments.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchFlowDocuments.fulfilled, (state, action) => {
        if (!same(state.filters, action.meta.arg)) return;
        state.rows = action.payload.rows as Draft<InvoiceListRow>[];
        state.totals = action.payload.totals;
        state.tabs = action.payload.tabs;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.total = action.payload.total;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchFlowDocuments.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { flowFiltersChanged } = salesDocListSlice.actions;
export const salesDocListReducer = salesDocListSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof salesDocListSlice> {}
}

const injected = salesDocListSlice.injectInto(rootReducer);

export const selectSalesDocList = (state: RootState): SalesDocListState =>
  injected.selectSlice(state);
