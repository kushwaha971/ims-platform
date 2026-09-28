import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { importUploadProgressed } from './importJobActions';

import type { ImportJob } from '../types/import.types';

/**
 * Part 19 §19.3.3 — one service call each, and a catch that normalises.
 *
 * The service is imported INSIDE each thunk, as the expense thunks do: the
 * invalidation registry imports every thunk statically and the registry is in
 * the shell, so a service imported at the top of this file would ship to
 * every route. The price is one small chunk fetched with the first import
 * request of a session — paid by the merchant who opened the wizard.
 */
const service = () => import('../api/importService');

/** QUERY. One job — what the wizard polls (IMP-01 FR-8). */
export const fetchImportJob = createAsyncThunk<
  ImportJob,
  { readonly id: string; readonly quiet?: boolean },
  { rejectValue: ApiErrorShape }
>('importJob/fetchImportJob', async ({ id }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).getImportJob(id, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'imports.error.load'));
  }
});

/** MUTATION. Store the file and queue the check (FR-3); progress rides as actions. */
export const uploadImportFile = createAsyncThunk<
  ImportJob,
  { readonly kind: string; readonly file: File },
  { rejectValue: ApiErrorShape }
>('importJob/uploadImportFile', async ({ kind, file }, { dispatch, rejectWithValue }) => {
  try {
    return await (
      await service()
    ).uploadImport(kind, file, (percent) => dispatch(importUploadProgressed(percent)));
  } catch (error) {
    return rejectWithValue(toApiError(error, 'imports.error.upload'));
  }
});

/** MUTATION. Start the all-or-nothing commit (FR-6), with the press's own key. */
export const commitImportJob = createAsyncThunk<
  ImportJob,
  { readonly id: string; readonly idempotencyKey: string },
  { rejectValue: ApiErrorShape }
>('importJob/commitImportJob', async ({ id, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await service()).commitImport(id, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'imports.error.commit'));
  }
});

/** MUTATION. Abandon a job before it commits (FR-7) — nothing was saved. */
export const cancelImportJob = createAsyncThunk<ImportJob, string, { rejectValue: ApiErrorShape }>(
  'importJob/cancelImportJob',
  async (id, { rejectWithValue }) => {
    try {
      return await (await service()).cancelImport(id);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'imports.error.cancel'));
    }
  }
);
