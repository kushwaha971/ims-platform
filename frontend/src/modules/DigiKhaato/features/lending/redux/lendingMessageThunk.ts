import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './lendingInvalidation';

import type {
  LendingMessageKind,
  LendingReminderRow,
  MessageChannel,
  PreparedLendingMessage,
} from '../types/lending.types';

/** L03 — the messages' thunks; the service loads with the first request. */
const service = () => import('../api/lendingMessageService');

type Reject = { rejectValue: ApiErrorShape };

interface MessageTarget {
  loanId: string;
  kind: LendingMessageKind;
  collectionId?: string;
  text?: string;
}

export const fetchLendingReminders = createAsyncThunk<LendingReminderRow[], void, Reject>(
  'lendingMessages/fetch',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listReminders(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.messages.error.title'));
    }
  }
);

export const prepareLendingMessage = createAsyncThunk<
  PreparedLendingMessage,
  MessageTarget,
  Reject
>(
  'lendingMessages/prepare',
  async ({ loanId, kind, collectionId, text }, { signal, rejectWithValue }) => {
    try {
      const api = await service();
      return text === undefined
        ? await api.prepareMessage(loanId, kind, collectionId, signal)
        : await api.prepareMessage(loanId, kind, collectionId, signal, text);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.messages.error.prepare'));
    }
  }
);

export const recordLendingMessage = createAsyncThunk<
  boolean,
  MessageTarget & { channel: MessageChannel },
  Reject
>(
  'lendingMessages/record',
  async ({ loanId, kind, channel, collectionId, text }, { rejectWithValue }) => {
    try {
      const api = await service();
      if (text === undefined) await api.recordMessage(loanId, kind, channel, collectionId);
      else await api.recordMessage(loanId, kind, channel, collectionId, text);
      return true;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'lending.messages.error.record'));
    }
  }
);
