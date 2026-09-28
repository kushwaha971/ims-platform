import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { PAYMENT_PAGE_SIZE } from '../constants/paymentConstants';

import { fetchPayments } from './paymentThunk';

import type { PaymentFilters, PaymentRow, PaymentTotals } from '../types/payment.types';

/**
 * Part 19 §19.3.2 Shape B — the payments list. Route-local, so it is injected
 * lazily (CR-134) and ships with `/payments`, not with every route.
 */
export interface PaymentListState {
  rows: PaymentRow[];
  totals: PaymentTotals | null;
  page: number;
  pageSize: number;
  total: number;
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** The filters the rows on screen answer — the late-response guard's key. */
  filters: PaymentFilters | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: PaymentListState = {
  rows: [],
  totals: null,
  page: 1,
  pageSize: PAYMENT_PAGE_SIZE,
  total: 0,
  status: 'idle',
  error: null,
  filters: null,
  stale: false,
  staleUrgency: null,
};

const sameFilters = (a: PaymentFilters | null, b: PaymentFilters): boolean =>
  !!a &&
  a.dateFrom === b.dateFrom &&
  a.dateTo === b.dateTo &&
  a.tab === b.tab &&
  a.mode === b.mode &&
  a.q === b.q &&
  a.page === b.page;

const paymentListSlice = createSlice({
  name: 'paymentList',
  initialState,
  reducers: {
    /** Rows AND totals clear together: a total over last month's rows is never true. */
    paymentFiltersChanged(state, action: PayloadAction<PaymentFilters>) {
      if (sameFilters(state.filters, action.payload)) return;
      state.filters = action.payload as Draft<PaymentFilters>;
      state.rows = [];
      state.totals = null;
      state.status = 'loading';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<PaymentListState>('paymentList')(builder);
    builder
      .addCase(fetchPayments.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPayments.fulfilled, (state, action) => {
        if (!sameFilters(state.filters, action.meta.arg)) return;
        state.rows = action.payload.rows as Draft<PaymentRow>[];
        state.totals = action.payload.totals as Draft<PaymentTotals>;
        state.page = action.payload.page;
        state.pageSize = action.payload.pageSize;
        state.total = action.payload.total;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPayments.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { paymentFiltersChanged } = paymentListSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof paymentListSlice> {}
}

const injected = paymentListSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectPaymentRows = (state: RootState): readonly PaymentRow[] => slice$(state).rows;
export const selectPaymentTotals = (state: RootState): PaymentTotals | null => slice$(state).totals;
export const selectPaymentStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectPaymentError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectPaymentPage = (state: RootState): number => slice$(state).page;
export const selectPaymentPageSize = (state: RootState): number => slice$(state).pageSize;
export const selectPaymentTotal = (state: RootState): number => slice$(state).total;
export const selectPaymentListStale = (state: RootState): boolean => slice$(state).stale;
