import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchPurchaseBill, voidPurchaseBill } from './purchaseBillThunk';

import type { PurchaseBill } from '../types/purchase.types';

/**
 * PUR-01 FR-9 / PUR-04 — the bill detail. The void writes the voided bill
 * straight back here from its 200 (the `patch` the invalidation map declares),
 * so the Void banner is on screen the moment the dialog closes. Route-local,
 * injected lazily (CR-134).
 */
export interface PurchaseBillDetailState {
  bill: PurchaseBill | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  voiding: boolean;
  voidError: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: PurchaseBillDetailState = {
  bill: null,
  status: 'idle',
  error: null,
  voiding: false,
  voidError: null,
  stale: false,
  staleUrgency: null,
};

const purchaseBillDetailSlice = createSlice({
  name: 'purchaseBillDetail',
  initialState,
  reducers: {
    purchaseVoidErrorCleared(state) {
      state.voidError = null;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<PurchaseBillDetailState>('purchaseBillDetail')(builder);
    builder
      .addCase(fetchPurchaseBill.pending, (state, action) => {
        state.status = state.bill?.id === action.meta.arg ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPurchaseBill.fulfilled, (state, action) => {
        state.bill = action.payload.bill as Draft<PurchaseBill>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPurchaseBill.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(voidPurchaseBill.pending, (state) => {
        state.voiding = true;
        state.voidError = null;
      })
      .addCase(voidPurchaseBill.fulfilled, (state, action) => {
        state.voiding = false;
        state.bill = action.payload.bill as Draft<PurchaseBill>;
      })
      .addCase(voidPurchaseBill.rejected, (state, action) => {
        state.voiding = false;
        state.voidError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { purchaseVoidErrorCleared } = purchaseBillDetailSlice.actions;
export const purchaseBillDetailReducer = purchaseBillDetailSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof purchaseBillDetailSlice> {}
}

const injected = purchaseBillDetailSlice.injectInto(rootReducer);

export const selectPurchaseBillDetail = (state: RootState): PurchaseBillDetailState =>
  injected.selectSlice(state);
