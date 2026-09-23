import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  archiveParty as archivePartyCall,
  bulkArchiveParties as bulkArchiveCall,
  restoreParty as restorePartyCall,
  type BulkArchiveResult,
} from '../api/partyService';

import type { PartyDetail } from '../types/party.types';

export interface ArchivePartyArg {
  readonly id: string;
  readonly reason: string;
  /** Minted once per confirm dialog, so a retry is the same intent. */
  readonly idempotencyKey: string;
}

/**
 * COMMAND. The 409 `party_balance_nonzero` is NOT an error the snackbar should
 * carry: it is the dialog's own blocked state, with a balance and a suggestion
 * in `details` that only the dialog can render usefully. `toApiError` keeps
 * `details` and `status`, and the component decides.
 *
 * The rejection is returned rather than thrown so the caller can read the code
 * without a try/catch around a dispatch.
 */
export const archiveParty = createAsyncThunk<
  PartyDetail,
  ArchivePartyArg,
  { rejectValue: ApiErrorShape }
>('partyArchive/archiveParty', async ({ id, reason, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await archivePartyCall(id, reason, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.archive.error'));
  }
});

export interface RestorePartyArg {
  readonly id: string;
  readonly idempotencyKey: string;
}

export const restoreParty = createAsyncThunk<
  PartyDetail,
  RestorePartyArg,
  { rejectValue: ApiErrorShape }
>('partyArchive/restoreParty', async ({ id, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await restorePartyCall(id, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.restore.error'));
  }
});

export interface BulkArchiveArg {
  readonly ids: readonly string[];
  readonly reason: string;
  readonly idempotencyKey: string;
}

export const bulkArchiveParties = createAsyncThunk<
  BulkArchiveResult,
  BulkArchiveArg,
  { rejectValue: ApiErrorShape }
>('partyArchive/bulkArchive', async ({ ids, reason, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await bulkArchiveCall(ids, reason, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.archive.bulk.error'));
  }
});
