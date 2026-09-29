import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  allocateExistingPayment,
  fetchApplyCandidates,
  fetchCollectQr,
  fetchPayment,
  shareReceipt,
  voidPayment,
} from './paymentThunk';

import type { OpenDocument, Payment } from '../types/payment.types';

/**
 * PAY-04 / PAY-05 — the receipt page: the payment, the "Pay next time" static
 * QR, and
 * the void and share states. `paymentDetailSlice` in the FRD, split from the
 * list so the page and its print sheet share one copy.
 */
export interface PaymentReceiptState {
  payment: Payment | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** The static QR's modules (no amount — PAY-03 BR-3), or null when there is no VPA. */
  staticQr: readonly string[] | null;
  voidStatus: RequestStatus;
  shareStatus: RequestStatus;
  /** A4a — Apply to bills: the documents it offers, and the apply itself. */
  applyCandidates: readonly OpenDocument[];
  applyCandidatesStatus: RequestStatus;
  applyStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: PaymentReceiptState = {
  payment: null,
  status: 'idle',
  error: null,
  staticQr: null,
  voidStatus: 'idle',
  shareStatus: 'idle',
  applyCandidates: [],
  applyCandidatesStatus: 'idle',
  applyStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const paymentReceiptSlice = createSlice({
  name: 'paymentReceipt',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<PaymentReceiptState>('paymentReceipt')(builder);
    builder
      .addCase(fetchPayment.pending, (state, action) => {
        state.status = state.payment?.id === action.meta.arg ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPayment.fulfilled, (state, action) => {
        state.payment = action.payload as Draft<Payment>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPayment.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchCollectQr.fulfilled, (state, action) => {
        // Only the amount-less intent is the receipt's; the Collect sheet asks with one.
        if (!action.meta.arg.amount) state.staticQr = [...action.payload.qr.modules];
      })
      .addCase(voidPayment.pending, (state) => {
        state.voidStatus = 'loading';
      })
      .addCase(voidPayment.fulfilled, (state, action) => {
        state.voidStatus = 'succeeded';
        // The page shows the void in place from the server's answer (FR-8).
        state.payment = action.payload.payment as Draft<Payment>;
      })
      .addCase(voidPayment.rejected, (state) => {
        state.voidStatus = 'failed';
      })
      .addCase(fetchApplyCandidates.pending, (state) => {
        state.applyCandidatesStatus = 'loading';
      })
      .addCase(fetchApplyCandidates.fulfilled, (state, action) => {
        state.applyCandidates = action.payload as Draft<OpenDocument>[];
        state.applyCandidatesStatus = 'succeeded';
      })
      .addCase(fetchApplyCandidates.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.applyCandidatesStatus = 'failed';
      })
      .addCase(allocateExistingPayment.pending, (state) => {
        state.applyStatus = 'loading';
      })
      .addCase(allocateExistingPayment.fulfilled, (state, action) => {
        state.applyStatus = 'succeeded';
        // The receipt shows what was applied, in place, from the server's answer.
        state.payment = action.payload.payment as Draft<Payment>;
      })
      .addCase(allocateExistingPayment.rejected, (state) => {
        state.applyStatus = 'failed';
      })
      .addCase(shareReceipt.pending, (state) => {
        state.shareStatus = 'loading';
      })
      .addCase(shareReceipt.fulfilled, (state) => {
        state.shareStatus = 'succeeded';
      })
      .addCase(shareReceipt.rejected, (state) => {
        state.shareStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof paymentReceiptSlice> {}
}

const injected = paymentReceiptSlice.injectInto(rootReducer);

export const selectPaymentReceipt = (state: RootState): PaymentReceiptState =>
  injected.selectSlice(state);
