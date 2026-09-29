import { createSlice, isAnyOf, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  applyCreditNote,
  fetchFlowDocument,
  fetchOpenInvoices,
  moveEstimate,
  voidCreditNote,
  voidInvoice,
} from './salesFlowThunk';
import {
  createInvoiceShareLink,
  fetchInvoice,
  fetchUpiIntent,
  revokeInvoiceShareLink,
} from './salesThunk';

import type {
  InvoiceListRow,
  Rule46Check,
  SalesDocument,
  ShareLink,
  UpiIntent,
} from '../types/sales.types';
import type { VoidResult } from '../types/salesFlows.types';

/**
 * SAL-03 — the detail page and the print sheet read from here: the document
 * (an invoice, an estimate or a credit note), the UPI intent (QR matrix) and
 * the share link. The letterhead is `src/print` (R33, A16), shared with payments. The print route renders
 * from this cache without a refetch (§5). The document-level acts — an
 * estimate's status moves, apply, void — replace the held document with the
 * server's answer, so the page never shows a status the server did not send.
 */
export interface InvoiceDetailState {
  document: SalesDocument | null;
  rule46: Rule46Check | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  upi: UpiIntent | null;
  shareLink: ShareLink | null;
  sharing: boolean;
  /** An estimate move, an apply or a void is in flight. */
  acting: boolean;
  /** SAL-05 FR-6 — what the last void left behind (payments now unallocated). */
  voidResult: VoidResult | null;
  /** SAL-04 FR-9 — the party's bills with something due, for the apply dialog. */
  openInvoices: InvoiceListRow[];
}

const initialState: InvoiceDetailState = {
  document: null,
  rule46: null,
  status: 'idle',
  error: null,
  upi: null,
  shareLink: null,
  sharing: false,
  acting: false,
  voidResult: null,
  openInvoices: [],
};

const idOf = (arg: string | { readonly id: string }): string =>
  typeof arg === 'string' ? arg : arg.id;

const invoiceDetailSlice = createSlice({
  name: 'invoiceDetail',
  initialState,
  reducers: {
    voidResultSeen(state) {
      state.voidResult = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUpiIntent.fulfilled, (state, action) => {
        state.upi = action.payload as Draft<UpiIntent> | null;
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
      .addCase(revokeInvoiceShareLink.fulfilled, (state) => {
        state.shareLink = null;
      })
      .addCase(fetchOpenInvoices.fulfilled, (state, action) => {
        state.openInvoices = action.payload.rows as Draft<InvoiceListRow>[];
      })
      .addCase(voidInvoice.fulfilled, (state, action) => {
        state.voidResult = action.payload.voidResult as Draft<VoidResult>;
      })
      .addCase(resetAllFeatureState, () => initialState)
      .addMatcher(isAnyOf(fetchInvoice.pending, fetchFlowDocument.pending), (state, action) => {
        if (state.document?.id !== idOf(action.meta.arg)) {
          state.document = null;
          state.upi = null;
          state.shareLink = null;
          state.voidResult = null;
        }
        state.status = 'loading';
        state.error = null;
      })
      .addMatcher(isAnyOf(fetchInvoice.fulfilled, fetchFlowDocument.fulfilled), (state, action) => {
        state.document = action.payload.document as Draft<SalesDocument>;
        state.rule46 = action.payload.rule46 as Draft<Rule46Check> | null;
        state.status = 'succeeded';
      })
      .addMatcher(isAnyOf(fetchInvoice.rejected, fetchFlowDocument.rejected), (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addMatcher(
        isAnyOf(
          moveEstimate.pending,
          applyCreditNote.pending,
          voidInvoice.pending,
          voidCreditNote.pending
        ),
        (state) => {
          state.acting = true;
        }
      )
      .addMatcher(
        isAnyOf(
          moveEstimate.fulfilled,
          applyCreditNote.fulfilled,
          voidInvoice.fulfilled,
          voidCreditNote.fulfilled
        ),
        (state, action) => {
          state.acting = false;
          if (state.document?.id === action.payload.document.id) {
            state.document = action.payload.document as Draft<SalesDocument>;
          }
        }
      )
      .addMatcher(
        isAnyOf(
          moveEstimate.rejected,
          applyCreditNote.rejected,
          voidInvoice.rejected,
          voidCreditNote.rejected
        ),
        (state) => {
          state.acting = false;
        }
      );
  },
});

export const { voidResultSeen } = invoiceDetailSlice.actions;
export const invoiceDetailReducer = invoiceDetailSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof invoiceDetailSlice> {}
}

const injected = invoiceDetailSlice.injectInto(rootReducer);

export const selectInvoiceDetail = (state: RootState): InvoiceDetailState =>
  injected.selectSlice(state);
