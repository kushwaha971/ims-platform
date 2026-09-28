import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { PURCHASE_BILL_PAGE_SIZE } from '../constants/purchaseConstants';

import { fetchPurchaseBillList } from './purchaseBillThunk';

import type { PurchaseBillListQuery } from '../api/purchaseBillService';
import type {
  PurchaseBillListRow,
  PurchaseBillTabCounts,
  PurchaseBillTotals,
} from '../types/purchase.types';

/**
 * Part 19 §19.3.2 Shape B — the purchase bills list (PUR-03). Route-local, so
 * it is injected lazily (CR-134) and ships with `/purchases/bills` only.
 */
export interface PurchaseBillListState {
  rows: PurchaseBillListRow[];
  totals: PurchaseBillTotals | null;
  counts: PurchaseBillTabCounts | null;
  page: number;
  pageSize: number;
  total: number;
  status: RequestStatus;
  error: ApiErrorShape | null;
  filters: PurchaseBillListQuery | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: PurchaseBillListState = {
  rows: [],
  totals: null,
  counts: null,
  page: 1,
  pageSize: PURCHASE_BILL_PAGE_SIZE,
  total: 0,
  status: 'idle',
  error: null,
  filters: null,
  stale: false,
  staleUrgency: null,
};

const sameFilters = (a: PurchaseBillListQuery | null, b: PurchaseBillListQuery): boolean =>
  !!a &&
  a.tab === b.tab &&
  a.dateFrom === b.dateFrom &&
  a.dateTo === b.dateTo &&
  a.partyId === b.partyId &&
  a.q === b.q &&
  a.page === b.page;

const purchaseBillListSlice = createSlice({
  name: 'purchaseBillList',
  initialState,
  reducers: {
    /** Rows AND totals clear together — a total over the previous filter's rows was never true. */
    purchaseBillFiltersChanged(state, action: PayloadAction<PurchaseBillListQuery>) {
      if (sameFilters(state.filters, action.payload)) return;
      state.filters = action.payload as Draft<PurchaseBillListQuery>;
      state.rows = [];
      state.totals = null;
      state.status = 'loading';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<PurchaseBillListState>('purchaseBillList')(builder);
    builder
      .addCase(fetchPurchaseBillList.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPurchaseBillList.fulfilled, (state, action) => {
        if (!sameFilters(state.filters, action.meta.arg)) return;
        state.rows = action.payload.rows as Draft<PurchaseBillListRow>[];
        state.totals = action.payload.totals;
        state.counts = action.payload.counts as Draft<PurchaseBillTabCounts>;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.total = action.payload.total;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPurchaseBillList.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { purchaseBillFiltersChanged } = purchaseBillListSlice.actions;
export const purchaseBillListReducer = purchaseBillListSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof purchaseBillListSlice> {}
}

const injected = purchaseBillListSlice.injectInto(rootReducer);

export const selectPurchaseBillList = (state: RootState): PurchaseBillListState =>
  injected.selectSlice(state);
