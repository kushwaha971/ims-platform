import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type {
  DeleteRequestInput,
  DeletionState,
  SupportAccess,
  SupportDecision,
  TenantExport,
} from '../types/accountData.types';

/**
 * PLT-10 FRD §14 — `requestExport`, `pollExport`, `requestDeletion`,
 * `cancelDeletion`, plus the page's first read and PLT-14's consent decision.
 * The service is imported inside each thunk so none of it reaches a route that
 * never opens "Your data".
 */

const service = () => import('../api/accountDataService');

export interface AccountDataSnapshot {
  readonly deletion: DeletionState;
  readonly exports: TenantExport[];
  readonly support: SupportAccess[];
}

/** QUERY — the whole page in one round of three parallel reads. */
export const fetchAccountData = createAsyncThunk<
  AccountDataSnapshot,
  void,
  { rejectValue: ApiErrorShape }
>('accountData/fetch', async (_arg, { signal, rejectWithValue }) => {
  try {
    const api = await service();
    const [deletion, exports, support] = await Promise.all([
      api.getDeletionState(signal),
      api.listExports(signal),
      api.listSupportAccess(signal),
    ]);
    return { deletion, exports, support };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'data.error.body'));
  }
});

/** MUTATION — FR-1. */
export const requestExport = createAsyncThunk<TenantExport, void, { rejectValue: ApiErrorShape }>(
  'accountData/requestExport',
  async (_arg, { rejectWithValue }) => {
    try {
      return await (await service()).requestExport();
    } catch (error) {
      return rejectWithValue(toApiError(error, 'data.export.error'));
    }
  }
);

/** QUERY — FR-2's poll of one export. */
export const pollExport = createAsyncThunk<TenantExport, string, { rejectValue: ApiErrorShape }>(
  'accountData/pollExport',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getExport(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'data.export.error'));
    }
  }
);

/** QUERY — the gate re-read after an export finishes. */
export const refreshDeletion = createAsyncThunk<
  DeletionState,
  void,
  { rejectValue: ApiErrorShape }
>('accountData/refreshDeletion', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await (await service()).getDeletionState(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'data.error.body'));
  }
});

/** MUTATION — FR-3. */
export const requestDeletion = createAsyncThunk<
  DeletionState,
  DeleteRequestInput,
  { rejectValue: ApiErrorShape }
>('accountData/requestDeletion', async (input, { rejectWithValue }) => {
  try {
    return await (await service()).requestDeletion(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'data.delete.error'));
  }
});

/** MUTATION — FR-4. */
export const cancelDeletion = createAsyncThunk<DeletionState, void, { rejectValue: ApiErrorShape }>(
  'accountData/cancelDeletion',
  async (_arg, { rejectWithValue }) => {
    try {
      return await (await service()).cancelDeletion();
    } catch (error) {
      return rejectWithValue(toApiError(error, 'data.cancel.error'));
    }
  }
);

/** MUTATION — PLT-14 FR-6, the owner's answer. */
export const decideSupportAccess = createAsyncThunk<
  SupportAccess,
  { readonly id: string; readonly decision: SupportDecision },
  { rejectValue: ApiErrorShape }
>('accountData/decideSupport', async ({ id, decision }, { rejectWithValue }) => {
  try {
    return await (await service()).decideSupportAccess(id, decision);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'data.support.error'));
  }
});
