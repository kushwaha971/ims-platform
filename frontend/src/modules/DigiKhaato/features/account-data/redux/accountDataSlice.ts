import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  cancelDeletion,
  decideSupportAccess,
  fetchAccountData,
  pollExport,
  refreshDeletion,
  requestDeletion,
  requestExport,
} from './accountDataThunk';

import type { DeletionState, SupportAccess, TenantExport } from '../types/accountData.types';

/**
 * PLT-10 FRD §14 — `accountDataSlice` (`exports`, `deletion`, `status`), plus
 * the support-consent rows the same page lists. Route-local, so it is injected
 * lazily (CR-134) and ships only with `/settings/data`.
 */
export interface AccountDataState {
  status: RequestStatus;
  error: ApiErrorShape | null;
  deletion: DeletionState | null;
  exports: TenantExport[];
  support: SupportAccess[];
  exportStatus: RequestStatus;
  deleteStatus: RequestStatus;
  cancelStatus: RequestStatus;
  decidingId: string | null;
}

const initialState: AccountDataState = {
  status: 'idle',
  error: null,
  deletion: null,
  exports: [],
  support: [],
  exportStatus: 'idle',
  deleteStatus: 'idle',
  cancelStatus: 'idle',
  decidingId: null,
};

/** The newest copy of an export replaces the old one; a new one goes first. */
const upsertExport = (list: TenantExport[], row: TenantExport): TenantExport[] => {
  const rest = list.filter((item) => item.id !== row.id);
  return [row, ...rest].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).slice(0, 5);
};

const accountDataSlice = createSlice({
  name: 'accountData',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccountData.pending, (state) => {
        state.status = state.deletion ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchAccountData.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.deletion = action.payload.deletion as Draft<DeletionState>;
        state.exports = action.payload.exports as Draft<TenantExport>[];
        state.support = action.payload.support as Draft<SupportAccess>[];
      })
      .addCase(fetchAccountData.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(requestExport.pending, (state) => {
        state.exportStatus = 'loading';
      })
      .addCase(requestExport.fulfilled, (state, action) => {
        state.exportStatus = 'succeeded';
        state.exports = upsertExport(state.exports as TenantExport[], action.payload) as Draft<
          TenantExport[]
        >;
      })
      .addCase(requestExport.rejected, (state) => {
        state.exportStatus = 'failed';
      })
      .addCase(pollExport.fulfilled, (state, action) => {
        state.exports = upsertExport(state.exports as TenantExport[], action.payload) as Draft<
          TenantExport[]
        >;
      })
      .addCase(refreshDeletion.fulfilled, (state, action) => {
        state.deletion = action.payload as Draft<DeletionState>;
      })
      .addCase(requestDeletion.pending, (state) => {
        state.deleteStatus = 'loading';
      })
      .addCase(requestDeletion.fulfilled, (state, action) => {
        state.deleteStatus = 'succeeded';
        state.deletion = action.payload as Draft<DeletionState>;
      })
      .addCase(requestDeletion.rejected, (state) => {
        state.deleteStatus = 'failed';
      })
      .addCase(cancelDeletion.pending, (state) => {
        state.cancelStatus = 'loading';
      })
      .addCase(cancelDeletion.fulfilled, (state, action) => {
        state.cancelStatus = 'succeeded';
        state.deletion = action.payload as Draft<DeletionState>;
      })
      .addCase(cancelDeletion.rejected, (state) => {
        state.cancelStatus = 'failed';
      })
      .addCase(decideSupportAccess.pending, (state, action) => {
        state.decidingId = action.meta.arg.id;
      })
      .addCase(decideSupportAccess.fulfilled, (state, action) => {
        state.decidingId = null;
        state.support = state.support.map((row) =>
          row.id === action.payload.id ? (action.payload as Draft<SupportAccess>) : row
        );
      })
      .addCase(decideSupportAccess.rejected, (state) => {
        state.decidingId = null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const accountDataReducer = accountDataSlice.reducer;

// ── Lazy registration (CR-134) ───────────────────────────────────────────────

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof accountDataSlice> {}
}

const injected = accountDataSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectAccountData = (state: RootState): AccountDataState => slice$(state);
