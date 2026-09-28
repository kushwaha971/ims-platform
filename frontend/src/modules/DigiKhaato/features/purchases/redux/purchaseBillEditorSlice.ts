import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  checkDuplicateSupplierInvoice,
  deletePurchaseBillDraft,
  fetchPurchaseBill,
  fetchPurchaseContext,
  recordPurchaseBill,
  savePurchaseBillDraft,
  type PurchaseContext,
} from './purchaseBillThunk';

import type {
  DuplicateSupplierInvoice,
  PurchaseBill,
  PurchaseBillEnvelope,
  PurchaseWarning,
} from '../types/purchase.types';

/**
 * PUR-01 §7 `purchaseBillEditorSlice` — the editor's SERVER-derived state. The
 * form (React Hook Form) owns every editable value; this slice owns what only
 * the server can say: the draft's id and version, warnings, the save
 * indicator, the recorded bill, and the duplicate-invoice warning (FR-7).
 * Route-local, injected lazily (CR-134).
 */
export type PurchaseSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface PurchaseBillEditorState {
  documentId: string | null;
  version: number | null;
  document: PurchaseBill | null;
  loadStatus: RequestStatus;
  context: PurchaseContext | null;
  saveState: PurchaseSaveState;
  savedAt: string | null;
  recording: boolean;
  recorded: PurchaseBillEnvelope | null;
  warnings: PurchaseWarning[];
  duplicate: DuplicateSupplierInvoice | null;
  error: ApiErrorShape | null;
}

const initialState: PurchaseBillEditorState = {
  documentId: null,
  version: null,
  document: null,
  loadStatus: 'idle',
  context: null,
  saveState: 'idle',
  savedAt: null,
  recording: false,
  recorded: null,
  warnings: [],
  duplicate: null,
  error: null,
};

const accept = (state: Draft<PurchaseBillEditorState>, envelope: PurchaseBillEnvelope) => {
  state.documentId = envelope.bill.id;
  state.version = envelope.bill.version;
  state.document = envelope.bill as Draft<PurchaseBill>;
  state.warnings = envelope.warnings as Draft<PurchaseWarning>[];
};

/** The 409's `details.existing` → the same shape the blur check produces. */
const duplicateFrom = (error: ApiErrorShape | undefined): DuplicateSupplierInvoice | null => {
  if (error?.code !== 'duplicate_supplier_invoice') return null;
  const existing = (error.details as Record<string, unknown> | undefined)?.existing as
    Record<string, unknown> | undefined;
  if (!existing) return null;
  return {
    id: String(existing.id ?? ''),
    number: String(existing.number ?? ''),
    documentDate: String(existing.document_date ?? ''),
  };
};

const purchaseBillEditorSlice = createSlice({
  name: 'purchaseBillEditor',
  initialState,
  reducers: {
    /** A fresh editor: everything but the loaded context goes. */
    purchaseEditorReset(state) {
      return { ...initialState, context: state.context };
    },
    /** "Keep mine" after a stale-version conflict: the next save carries the current version. */
    purchaseConflictResolved(state, action: PayloadAction<{ version: number }>) {
      state.version = action.payload.version;
      state.saveState = 'idle';
    },
    purchaseDuplicateCleared(state) {
      state.duplicate = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPurchaseContext.fulfilled, (state, action) => {
        state.context = action.payload as Draft<PurchaseContext>;
      })
      .addCase(fetchPurchaseBill.pending, (state) => {
        state.loadStatus = 'loading';
        state.error = null;
      })
      .addCase(fetchPurchaseBill.fulfilled, (state, action) => {
        accept(state, action.payload);
        state.loadStatus = 'succeeded';
      })
      .addCase(fetchPurchaseBill.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.loadStatus = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(savePurchaseBillDraft.pending, (state) => {
        state.saveState = 'saving';
      })
      .addCase(savePurchaseBillDraft.fulfilled, (state, action) => {
        accept(state, action.payload);
        state.saveState = 'saved';
        state.savedAt = action.payload.bill.updatedAt;
      })
      .addCase(savePurchaseBillDraft.rejected, (state, action) => {
        state.saveState = action.payload?.code === 'stale_version' ? 'conflict' : 'error';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(recordPurchaseBill.pending, (state) => {
        state.recording = true;
        state.error = null;
      })
      .addCase(recordPurchaseBill.fulfilled, (state, action) => {
        accept(state, action.payload);
        state.recording = false;
        state.recorded = action.payload as Draft<PurchaseBillEnvelope>;
        state.duplicate = null;
      })
      .addCase(recordPurchaseBill.rejected, (state, action) => {
        state.recording = false;
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        state.duplicate = duplicateFrom(action.payload) ?? state.duplicate;
      })
      .addCase(checkDuplicateSupplierInvoice.fulfilled, (state, action) => {
        state.duplicate = action.payload;
      })
      .addCase(deletePurchaseBillDraft.fulfilled, (state) => ({
        ...initialState,
        context: state.context,
      }))
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { purchaseEditorReset, purchaseConflictResolved, purchaseDuplicateCleared } =
  purchaseBillEditorSlice.actions;
export const purchaseBillEditorReducer = purchaseBillEditorSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof purchaseBillEditorSlice> {}
}

const injected = purchaseBillEditorSlice.injectInto(rootReducer);

export const selectPurchaseBillEditor = (state: RootState): PurchaseBillEditorState =>
  injected.selectSlice(state);
