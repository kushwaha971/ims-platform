import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchExportJob } from './exportThunk';
import { importUploadProgressed } from './importJobActions';
import { cancelImportJob, commitImportJob, fetchImportJob, uploadImportFile } from './importThunk';

import type { ExportJob, ImportJob } from '../types/import.types';

/**
 * IMP-01 §7 — ONE slice shared by every import kind ("module-specific features
 * never add a slice"). Route-local: injected lazily (CR-134), so it ships with
 * `/imports` and not with the login screen.
 *
 * It holds the one job the wizard is looking at. The job is the SERVER's
 * record — status, counts, errors, preview — replaced whole on every poll, so
 * there is no field here the client computes and could get wrong.
 */
export interface ImportJobState {
  job: ImportJob | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  upload: {
    status: RequestStatus;
    /** 0–100 from the XHR progress event; null before the first tick. */
    percent: number | null;
    error: ApiErrorShape | null;
  };
  committing: boolean;
  cancelling: boolean;
  /** The stored export behind `/imports?export=` (the notification's link). */
  exportJob: ExportJob | null;
  exportStatus: RequestStatus;
}

const initialState: ImportJobState = {
  job: null,
  status: 'idle',
  error: null,
  upload: { status: 'idle', percent: null, error: null },
  committing: false,
  cancelling: false,
  exportJob: null,
  exportStatus: 'idle',
};

const importJobSlice = createSlice({
  name: 'importJob',
  initialState,
  reducers: {
    /** A new wizard session: nothing from the last file may show on this one. */
    importWizardReset: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchImportJob.pending, (state, action) => {
        // A poll of the job already on screen keeps it; a different job clears.
        if (state.job?.id !== action.meta.arg.id) {
          state.job = null;
          state.status = 'loading';
        } else {
          state.status = 'refreshing';
        }
      })
      .addCase(fetchImportJob.fulfilled, (state, action) => {
        state.job = action.payload as Draft<ImportJob>;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(fetchImportJob.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(importUploadProgressed, (state, action) => {
        state.upload.percent = action.payload;
      })
      .addCase(uploadImportFile.pending, (state) => {
        state.upload = { status: 'loading', percent: null, error: null };
      })
      .addCase(uploadImportFile.fulfilled, (state, action) => {
        state.upload = { status: 'succeeded', percent: 100, error: null };
        state.job = action.payload as Draft<ImportJob>;
        state.status = 'succeeded';
      })
      .addCase(uploadImportFile.rejected, (state, action) => {
        state.upload = {
          status: 'failed',
          percent: null,
          error: (action.payload ?? null) as Draft<ApiErrorShape> | null,
        };
      })
      .addCase(commitImportJob.pending, (state) => {
        state.committing = true;
      })
      .addCase(commitImportJob.fulfilled, (state, action) => {
        state.committing = false;
        state.job = action.payload as Draft<ImportJob>;
      })
      .addCase(commitImportJob.rejected, (state) => {
        state.committing = false;
      })
      .addCase(cancelImportJob.pending, (state) => {
        state.cancelling = true;
      })
      .addCase(cancelImportJob.fulfilled, (state, action) => {
        state.cancelling = false;
        if (state.job?.id === action.payload.id) state.job = action.payload as Draft<ImportJob>;
      })
      .addCase(cancelImportJob.rejected, (state) => {
        state.cancelling = false;
      })
      .addCase(fetchExportJob.pending, (state) => {
        state.exportStatus = state.exportJob ? 'refreshing' : 'loading';
      })
      .addCase(fetchExportJob.fulfilled, (state, action) => {
        state.exportJob = action.payload as Draft<ExportJob>;
        state.exportStatus = 'succeeded';
      })
      .addCase(fetchExportJob.rejected, (state) => {
        state.exportStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { importWizardReset } = importJobSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof importJobSlice> {}
}

const injected = importJobSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectImportJob = (state: RootState): ImportJob | null => slice$(state).job;
export const selectImportJobStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectImportJobError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectImportUpload = (state: RootState): ImportJobState['upload'] =>
  slice$(state).upload;
export const selectImportCommitting = (state: RootState): boolean => slice$(state).committing;
export const selectImportCancelling = (state: RootState): boolean => slice$(state).cancelling;
export const selectExportJob = (state: RootState): ExportJob | null => slice$(state).exportJob;
export const selectExportJobStatus = (state: RootState): RequestStatus =>
  slice$(state).exportStatus;
