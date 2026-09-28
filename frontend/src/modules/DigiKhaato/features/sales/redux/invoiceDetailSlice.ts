import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  createInvoiceShareLink,
  fetchInvoice,
  fetchPrintBranding,
  fetchUpiIntent,
  type PrintBranding,
} from './salesThunk';

import type { Rule46Check, SalesDocument, ShareLink, UpiIntent } from '../types/sales.types';

/**
 * SAL-03 — the detail page and the print sheet read from here: the document,
 * the UPI intent (QR matrix), the branding for the letterhead and the share
 * link. The print route renders from this cache without a refetch (§5).
 */
export interface InvoiceDetailState {
  document: SalesDocument | null;
  rule46: Rule46Check | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  upi: UpiIntent | null;
  branding: PrintBranding | null;
  shareLink: ShareLink | null;
  sharing: boolean;
}

const initialState: InvoiceDetailState = {
  document: null,
  rule46: null,
  status: 'idle',
  error: null,
  upi: null,
  branding: null,
  shareLink: null,
  sharing: false,
};

const invoiceDetailSlice = createSlice({
  name: 'invoiceDetail',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvoice.pending, (state, action) => {
        if (state.document?.id !== action.meta.arg) {
          state.document = null;
          state.upi = null;
          state.shareLink = null;
        }
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchInvoice.fulfilled, (state, action) => {
        state.document = action.payload.document as Draft<SalesDocument>;
        state.rule46 = action.payload.rule46 as Draft<Rule46Check> | null;
        state.status = 'succeeded';
      })
      .addCase(fetchInvoice.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchUpiIntent.fulfilled, (state, action) => {
        state.upi = action.payload as Draft<UpiIntent> | null;
      })
      .addCase(fetchPrintBranding.fulfilled, (state, action) => {
        state.branding = action.payload;
      })
      .addCase(createInvoiceShareLink.pending, (state) => {
        state.sharing = true;
      })
      .addCase(createInvoiceShareLink.fulfilled, (state, action) => {
        state.sharing = false;
        state.shareLink = action.payload;
      })
      .addCase(createInvoiceShareLink.rejected, (state) => {
        state.sharing = false;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const invoiceDetailReducer = invoiceDetailSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof invoiceDetailSlice> {}
}

const injected = invoiceDetailSlice.injectInto(rootReducer);

export const selectInvoiceDetail = (state: RootState): InvoiceDetailState =>
  injected.selectSlice(state);
