import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchCreditSource, issueCreditNote } from './salesFlowThunk';

import type { CreditNoteIssued } from '../api/creditNoteService';
import type { SalesDocument } from '../types/sales.types';

/**
 * SAL-04 §14 — the return editor's SERVER-derived state: the invoice being
 * returned against (its lines, what each has already had returned, the
 * snapshot rates the preview prices at) and the issue's outcome. What the
 * merchant types — quantities, reason, restock, settlement — is the form's.
 */
export interface CreditNoteEditorState {
  source: SalesDocument | null;
  loadStatus: RequestStatus;
  issuing: boolean;
  issued: CreditNoteIssued | null;
  error: ApiErrorShape | null;
}

const initialState: CreditNoteEditorState = {
  source: null,
  loadStatus: 'idle',
  issuing: false,
  issued: null,
  error: null,
};

const creditNoteEditorSlice = createSlice({
  name: 'creditNoteEditor',
  initialState,
  reducers: {
    creditNoteEditorReset: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCreditSource.pending, (state) => {
        state.loadStatus = 'loading';
        state.error = null;
      })
      .addCase(fetchCreditSource.fulfilled, (state, action) => {
        state.source = action.payload.document as Draft<SalesDocument>;
        state.loadStatus = 'succeeded';
      })
      .addCase(fetchCreditSource.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.loadStatus = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(issueCreditNote.pending, (state) => {
        state.issuing = true;
        state.error = null;
      })
      .addCase(issueCreditNote.fulfilled, (state, action) => {
        state.issuing = false;
        state.issued = action.payload as Draft<CreditNoteIssued>;
      })
      .addCase(issueCreditNote.rejected, (state, action) => {
        state.issuing = false;
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { creditNoteEditorReset } = creditNoteEditorSlice.actions;
export const creditNoteEditorReducer = creditNoteEditorSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof creditNoteEditorSlice> {}
}

const injected = creditNoteEditorSlice.injectInto(rootReducer);

export const selectCreditNoteEditor = (state: RootState): CreditNoteEditorState =>
  injected.selectSlice(state);
