import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { INVOICE_PAGE_SIZE } from '../constants/salesConstants';

import { fetchInvoices } from './salesThunk';

import type { InvoiceListQuery } from '../api/salesService';
import type { InvoiceListRow, InvoiceListTotals, InvoiceTabCounts } from '../types/sales.types';

/**
 * Part 19 §19.3.2 Shape B — the bills list (SAL-08). Route-local, so it is
 * injected lazily (CR-134) and ships with `/sales/invoices` only.
 */
export interface InvoiceListState {
  rows: InvoiceListRow[];
  totals: InvoiceListTotals | null;
  tabs: InvoiceTabCounts | null;
  page: number;
  pageSize: number;
  total: number;
  status: RequestStatus;
  error: ApiErrorShape | null;
  filters: InvoiceListQuery | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: InvoiceListState = {
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

const sameFilters = (a: InvoiceListQuery | null, b: InvoiceListQuery): boolean =>
  !!a &&
  a.tab === b.tab &&
  a.dateFrom === b.dateFrom &&
  a.dateTo === b.dateTo &&
  a.partyId === b.partyId &&
  a.q === b.q &&
  a.page === b.page;

const invoiceListSlice = createSlice({
  name: 'invoiceList',
  initialState,
  reducers: {
    /** Rows AND totals clear together — a total over the previous filter's rows was never true. */
    invoiceFiltersChanged(state, action: PayloadAction<InvoiceListQuery>) {
      if (sameFilters(state.filters, action.payload)) return;
      state.filters = action.payload as Draft<InvoiceListQuery>;
      state.rows = [];
      state.totals = null;
      state.status = 'loading';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<InvoiceListState>('invoiceList')(builder);
    builder
      .addCase(fetchInvoices.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        if (!sameFilters(state.filters, action.meta.arg)) return;
        state.rows = action.payload.rows as Draft<InvoiceListRow>[];
        state.totals = action.payload.totals;
        state.tabs = action.payload.tabs as Draft<InvoiceTabCounts>;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.total = action.payload.total;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { invoiceFiltersChanged } = invoiceListSlice.actions;
export const invoiceListReducer = invoiceListSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof invoiceListSlice> {}
}

const injected = invoiceListSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectInvoiceList = (state: RootState): InvoiceListState => slice$(state);
