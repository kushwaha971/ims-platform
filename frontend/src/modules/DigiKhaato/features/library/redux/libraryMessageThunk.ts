import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type {
  BulkMessageRequest,
  BulkMessageRow,
  FeeReminderRow,
  MessageKind,
  MessageLogRow,
  PreparedMessage,
} from '../types/message.types';

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
  { membershipId: string; kind: MessageKind; text?: string },
  Reject
>('libraryMessages/prepare', async ({ membershipId, kind, text }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).prepareMessage(membershipId, kind, signal, text);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.messages.error.prepare'));
  }
});

export const recordLibraryMessage = createAsyncThunk<
  boolean,
  { membershipId: string; kind: MessageKind; text?: string; finalText?: string },
  Reject
>(
  'libraryMessages/record',
  async ({ membershipId, kind, text, finalText }, { rejectWithValue }) => {
    try {
      await (await service()).recordMessage(membershipId, kind, text, finalText);
      return true;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.messages.error.record'));
    }
  }
);

/** QA F4 / B51 — a group's messages, prepared for the desk to open one by one. */
export const prepareBulkMessages = createAsyncThunk<BulkMessageRow[], BulkMessageRequest, Reject>(
  'libraryMessages/bulk',
  async (request, { signal, rejectWithValue }) => {
    try {
      return await (await service()).prepareBulk(request, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.messages.error.prepare'));
    }
  }
);

export const fetchMessageLog = createAsyncThunk<MessageLogRow[], string, Reject>(
  'libraryMessages/log',
  async (membershipId, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listMessageLog(membershipId, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.messages.log.error'));
    }
  }
);
