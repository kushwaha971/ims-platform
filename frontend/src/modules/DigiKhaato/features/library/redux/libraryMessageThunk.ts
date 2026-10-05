import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { FeeReminderRow, MessageKind, PreparedMessage } from '../types/message.types';

/** W06 — the messages' thunks; the service loads with the first request. */
const service = () => import('../api/libraryMessageService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchFeeReminders = createAsyncThunk<FeeReminderRow[], void, Reject>(
  'libraryMessages/fetch',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listFeeReminders(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.messages.error.title'));
    }
  }
);

export const prepareLibraryMessage = createAsyncThunk<
  PreparedMessage,
  { membershipId: string; kind: MessageKind },
  Reject
>('libraryMessages/prepare', async ({ membershipId, kind }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).prepareMessage(membershipId, kind, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.messages.error.prepare'));
  }
});

export const recordLibraryMessage = createAsyncThunk<
  boolean,
  { membershipId: string; kind: MessageKind },
  Reject
>('libraryMessages/record', async ({ membershipId, kind }, { rejectWithValue }) => {
  try {
    await (await service()).recordMessage(membershipId, kind);
    return true;
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.messages.error.record'));
  }
});
