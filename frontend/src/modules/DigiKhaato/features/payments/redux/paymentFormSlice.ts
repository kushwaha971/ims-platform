import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchCollectQr, fetchOpenDocuments, recordPayment } from './paymentThunk';

import type { CollectQr, OpenDocument, PaymentFormValues } from '../types/payment.types';

/**
 * The Record-payment drawer and the Collect sheet — state more than one screen
 * opens (the payments list, the khata, the invoice page). Lazily injected by
 * whichever of them loads the drawer's chunk first (CR-134); the pages that
 * open it hold only "is it open, and with what context" in local state, so
 * this slice never ships in a page chunk.
 */
export interface PaymentFormState {
  /** The party the held open bills belong to — a late answer for another is dropped. */
  openFor: string | null;
  openDocuments: OpenDocument[];
  openStatus: RequestStatus;
  saveStatus: RequestStatus;
  /** What was typed when a save failed, so a retry resends it (with the same key). */
  draft: PaymentFormValues | null;
  qr: CollectQr | null;
  qrStatus: RequestStatus;
  qrError: ApiErrorShape | null;
}

const initialState: PaymentFormState = {
  openFor: null,
  openDocuments: [],
  openStatus: 'idle',
  saveStatus: 'idle',
  draft: null,
  qr: null,
  qrStatus: 'idle',
  qrError: null,
};

const paymentFormSlice = createSlice({
  name: 'paymentForm',
  initialState,
  reducers: {
    paymentDraftDiscarded(state) {
      state.draft = null;
      state.saveStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOpenDocuments.pending, (state, action) => {
        state.openFor = action.meta.arg.partyId;
        state.openDocuments = [];
        state.openStatus = 'loading';
      })
      .addCase(fetchOpenDocuments.fulfilled, (state, action) => {
        if (state.openFor !== action.meta.arg.partyId) return;
        state.openDocuments = action.payload as Draft<OpenDocument>[];
        state.openStatus = 'succeeded';
      })
      .addCase(fetchOpenDocuments.rejected, (state, action) => {
        if (action.meta.aborted || state.openFor !== action.meta.arg.partyId) return;
        state.openStatus = 'failed';
      })
      .addCase(recordPayment.pending, (state, action) => {
        state.saveStatus = 'loading';
        state.draft = action.meta.arg.values as Draft<PaymentFormValues>;
      })
      .addCase(recordPayment.fulfilled, (state) => {
        state.saveStatus = 'succeeded';
        state.draft = null;
        // The bills it settled are no longer the bills on offer.
        state.openFor = null;
        state.openDocuments = [];
        state.openStatus = 'idle';
      })
      .addCase(recordPayment.rejected, (state) => {
        state.saveStatus = 'failed';
      })
      .addCase(fetchCollectQr.pending, (state) => {
        state.qrStatus = 'loading';
        state.qrError = null;
      })
      .addCase(fetchCollectQr.fulfilled, (state, action) => {
        state.qr = action.payload as Draft<CollectQr>;
        state.qrStatus = 'succeeded';
      })
      .addCase(fetchCollectQr.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.qr = null;
        state.qrStatus = 'failed';
        state.qrError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { paymentDraftDiscarded } = paymentFormSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof paymentFormSlice> {}
}

const injected = paymentFormSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectOpenDocuments = (state: RootState): readonly OpenDocument[] =>
  slice$(state).openDocuments;
export const selectOpenDocumentsStatus = (state: RootState): RequestStatus =>
  slice$(state).openStatus;
export const selectPaymentSaveStatus = (state: RootState): RequestStatus =>
  slice$(state).saveStatus;
export const selectPaymentDraft = (state: RootState): PaymentFormValues | null =>
  slice$(state).draft;
export const selectCollectQr = (state: RootState): CollectQr | null => slice$(state).qr;
export const selectCollectQrStatus = (state: RootState): RequestStatus => slice$(state).qrStatus;
export const selectCollectQrError = (state: RootState): ApiErrorShape | null =>
  slice$(state).qrError;
