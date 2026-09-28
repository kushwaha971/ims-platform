import {
  createSlice,
  isAnyOf,
  type Draft,
  type PayloadAction,
  type WithSlice,
} from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchFlowDocument, moveEstimate, saveEstimateDraft } from './salesFlowThunk';
import {
  deleteInvoiceDraft,
  fetchInvoice,
  fetchSalesContext,
  issueInvoice,
  saveInvoiceDraft,
  type SalesContext,
} from './salesThunk';

import type {
  Rule46Check,
  SalesDocument,
  SalesDocumentEnvelope,
  SalesWarning,
} from '../types/sales.types';

/**
 * SAL-02 §14 / SAL-06 — the editor's SERVER-derived state. The form (React
 * Hook Form) owns every editable value; this slice owns what only the server
 * can say: the draft's id and version, the stored totals, Rule 46, warnings,
 * the save indicator and the issued document. One handoff, in each direction.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface InvoiceEditorState {
  documentId: string | null;
  version: number | null;
  serverUpdatedAt: string | null;
  /** The document as the server last returned it (drives form init on edit). */
  document: SalesDocument | null;
  loadStatus: RequestStatus;
  context: SalesContext | null;
  saveState: SaveState;
  savedAt: string | null;
  issuing: boolean;
  issued: SalesDocumentEnvelope | null;
  warnings: SalesWarning[];
  rule46: Rule46Check | null;
  error: ApiErrorShape | null;
}

const initialState: InvoiceEditorState = {
  documentId: null,
  version: null,
  serverUpdatedAt: null,
  document: null,
  loadStatus: 'idle',
  context: null,
  saveState: 'idle',
  savedAt: null,
  issuing: false,
  issued: null,
  warnings: [],
  rule46: null,
  error: null,
};

const accept = (state: Draft<InvoiceEditorState>, envelope: SalesDocumentEnvelope) => {
  state.documentId = envelope.document.id;
  state.version = envelope.document.version;
  state.serverUpdatedAt = envelope.document.updatedAt;
  state.document = envelope.document as Draft<SalesDocument>;
  state.warnings = envelope.warnings as Draft<SalesWarning>[];
  state.rule46 = envelope.rule46 as Draft<Rule46Check> | null;
};

const invoiceEditorSlice = createSlice({
  name: 'invoiceEditor',
  initialState,
  reducers: {
    /** A fresh editor (new bill, or leaving one): everything but the loaded context goes. */
    editorReset(state) {
      return { ...initialState, context: state.context };
    },
    /** SAL-06 FR-9 — "Use server version": the conflict is resolved by reloading it. */
    conflictResolved(state, action: PayloadAction<{ version: number }>) {
      state.version = action.payload.version;
      state.saveState = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSalesContext.fulfilled, (state, action) => {
        state.context = action.payload as Draft<SalesContext>;
      })
      .addCase(issueInvoice.pending, (state) => {
        state.issuing = true;
        state.error = null;
      })
      .addCase(issueInvoice.fulfilled, (state, action) => {
        accept(state, action.payload);
        state.issuing = false;
        state.issued = action.payload as Draft<SalesDocumentEnvelope>;
      })
      .addCase(issueInvoice.rejected, (state, action) => {
        state.issuing = false;
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(deleteInvoiceDraft.fulfilled, (state) => ({
        ...initialState,
        context: state.context,
      }))
      .addCase(resetAllFeatureState, () => initialState)
      // SAL-01 — the estimate editor is this editor with another kind: the
      // same load, the same save states, and `mark-sent` as its "issue".
      .addCase(moveEstimate.pending, (state) => {
        state.issuing = true;
        state.error = null;
      })
      .addCase(moveEstimate.fulfilled, (state, action) => {
        accept(state, action.payload);
        state.issuing = false;
      })
      .addCase(moveEstimate.rejected, (state, action) => {
        state.issuing = false;
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addMatcher(isAnyOf(fetchInvoice.pending, fetchFlowDocument.pending), (state) => {
        state.loadStatus = 'loading';
        state.error = null;
      })
      .addMatcher(isAnyOf(fetchInvoice.fulfilled, fetchFlowDocument.fulfilled), (state, action) => {
        accept(state, action.payload);
        state.loadStatus = 'succeeded';
      })
      .addMatcher(isAnyOf(fetchInvoice.rejected, fetchFlowDocument.rejected), (state, action) => {
        if (action.meta.aborted) return;
        state.loadStatus = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addMatcher(isAnyOf(saveInvoiceDraft.pending, saveEstimateDraft.pending), (state) => {
        state.saveState = 'saving';
      })
      .addMatcher(
        isAnyOf(saveInvoiceDraft.fulfilled, saveEstimateDraft.fulfilled),
        (state, action) => {
          accept(state, action.payload);
          state.saveState = 'saved';
          state.savedAt = action.payload.document.updatedAt;
        }
      )
      .addMatcher(
        isAnyOf(saveInvoiceDraft.rejected, saveEstimateDraft.rejected),
        (state, action) => {
          const code = action.payload?.code;
          state.saveState = code === 'stale_version' ? 'conflict' : 'error';
          state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        }
      );
  },
});

export const { editorReset, conflictResolved } = invoiceEditorSlice.actions;
export const invoiceEditorReducer = invoiceEditorSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof invoiceEditorSlice> {}
}

const injected = invoiceEditorSlice.injectInto(rootReducer);

export const selectInvoiceEditor = (state: RootState): InvoiceEditorState =>
  injected.selectSlice(state);
