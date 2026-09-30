import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  listModuleReminders,
  previewSourceReminder,
  sendSourceReminder as sendSourceReminderRequest,
} from '../api/moduleReminderService';

import type {
  ModuleReminderRow,
  ReminderChannel,
  ReminderSourceRef,
  SourceReminderPreview,
} from '../types/reminder.types';

type Rejected = { rejectValue: ApiErrorShape };

/** QUERY — A7: one module's candidates, for its tab. */
export const fetchModuleReminders = createAsyncThunk<
  readonly ModuleReminderRow[],
  string,
  Rejected
>('moduleReminders/fetch', async (module, { signal, rejectWithValue }) => {
  try {
    return await listModuleReminders(module, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.error.body'));
  }
});

/** QUERY — A7: the server-composed text for one record (writes nothing). */
export const fetchSourcePreview = createAsyncThunk<
  SourceReminderPreview,
  ReminderSourceRef,
  Rejected
>('moduleReminders/preview', async (source, { signal, rejectWithValue }) => {
  try {
    return await previewSourceReminder(source, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.sheet.error'));
  }
});

/** MUTATION — A7: record the tap about one record (create, then send). */
export const sendSourceReminder = createAsyncThunk<
  string,
  {
    readonly source: ReminderSourceRef;
    readonly channel: Extract<ReminderChannel, 'whatsapp_manual' | 'sms_manual' | 'call'>;
  },
  Rejected
>('moduleReminders/send', async ({ source, channel }, { rejectWithValue }) => {
  try {
    return await sendSourceReminderRequest(source, channel);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.error.body'));
  }
});
