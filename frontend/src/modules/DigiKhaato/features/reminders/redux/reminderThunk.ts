import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  bulkReminders,
  createReminder,
  getCollectionSummary,
  getReminderSettings,
  listDueParties,
  listReminders,
  markReminder,
  previewReminder,
  sendReminder,
  updateReminderSettings,
} from '../api/reminderService';

import type {
  BulkReminderResult,
  CollectionBucket,
  CollectionSummary,
  DuePartyPage,
  Reminder,
  ReminderKindFilter,
  ReminderPage,
  ReminderPreview,
  ReminderSettings,
  ReminderSettingsPatch,
  SendManualReminderArg,
} from '../types/reminder.types';

/** Part 19 §19.3.3 — one service call each (two for the chained send), and a catch that normalises. */

type Rejected = { rejectValue: ApiErrorShape };

/** QUERY. LED-05 FR-3 — the three bucket figures. */
export const fetchCollectionSummary = createAsyncThunk<CollectionSummary, void, Rejected>(
  'reminders/fetchCollectionSummary',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await getCollectionSummary(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reminders.error.title'));
    }
  }
);

/** QUERY. One page of a bucket's parties. */
export const fetchDueParties = createAsyncThunk<
  DuePartyPage,
  { readonly bucket: CollectionBucket; readonly page: number; readonly pageSize: number },
  Rejected
>('reminders/fetchDueParties', async ({ bucket, page, pageSize }, { signal, rejectWithValue }) => {
  try {
    return await listDueParties(bucket, page, pageSize, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.error.title'));
  }
});

/** QUERY. The Sent tab — every reminder row, newest first, under one filter. */
export const fetchReminderHistory = createAsyncThunk<
  ReminderPage,
  { readonly filter: ReminderKindFilter; readonly page: number },
  Rejected
>('reminders/fetchReminderHistory', async ({ filter, page }, { signal, rejectWithValue }) => {
  try {
    return await listReminders(
      {
        kind: filter === 'auto' || filter === 'manual' ? filter : undefined,
        status: filter === 'failed' ? 'failed' : undefined,
        page,
        pageSize: 25,
      },
      signal
    );
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.error.title'));
  }
});

/** QUERY. LED-06 FR-6 — the khata's history strip. */
export const fetchPartyReminders = createAsyncThunk<ReminderPage, string, Rejected>(
  'reminders/fetchPartyReminders',
  async (partyId, { signal, rejectWithValue }) => {
    try {
      return await listReminders({ partyId, page: 1, pageSize: 5 }, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reminders.error.title'));
    }
  }
);

/** QUERY. The text the sheet shows, composed by the server (NTF-03 BR-2). */
export const fetchReminderPreview = createAsyncThunk<ReminderPreview, string, Rejected>(
  'reminders/fetchReminderPreview',
  async (partyId, { signal, rejectWithValue }) => {
    try {
      return await previewReminder(partyId, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reminders.error.title'));
    }
  }
);

/** QUERY. LED-07 FR-1 — the two switches and whether a provider exists. */
export const fetchReminderSettings = createAsyncThunk<ReminderSettings, void, Rejected>(
  'reminders/fetchReminderSettings',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await getReminderSettings(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reminders.error.title'));
    }
  }
);

/**
 * MUTATION. LED-06 FR-2 — the merchant tapped WhatsApp, SMS or Call.
 *
 * Dispatched from the tap on a real `<a>`: the browser has already opened the
 * app by the time this runs, so nothing here can be popup-blocked, and a sheet
 * that was opened and closed never reaches the server at all.
 */
export const sendManualReminder = createAsyncThunk<Reminder, SendManualReminderArg, Rejected>(
  'reminders/sendManualReminder',
  async ({ partyId, channel, note }, { rejectWithValue }) => {
    try {
      const created = await createReminder(partyId, channel, note);
      await sendReminder(created.id);
      return { ...created, status: 'sent' };
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reminders.error.send'));
    }
  }
);

/** MUTATION. FR-7 — one scheduled row and one ready link per selected party. */
export const startBulkReminders = createAsyncThunk<
  BulkReminderResult,
  { readonly partyIds: readonly string[]; readonly channel: 'whatsapp_manual' | 'sms_manual' },
  Rejected
>('reminders/startBulkReminders', async ({ partyIds, channel }, { rejectWithValue }) => {
  try {
    return await bulkReminders(partyIds, channel);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.error.send'));
  }
});

/** MUTATION. One step of the bulk flow — its link was just tapped. */
export const sendBulkStep = createAsyncThunk<string, string, Rejected>(
  'reminders/sendBulkStep',
  async (reminderId, { rejectWithValue }) => {
    try {
      await sendReminder(reminderId);
      return reminderId;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reminders.error.send'));
    }
  }
);

/** MUTATION. FR-9 — Done, Dismissed, or a bulk step the merchant skipped. */
export const markReminderStatus = createAsyncThunk<
  Reminder,
  { readonly reminderId: string; readonly status: 'done' | 'dismissed' },
  Rejected
>('reminders/markReminderStatus', async ({ reminderId, status }, { rejectWithValue }) => {
  try {
    return await markReminder(reminderId, status);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.error.send'));
  }
});

/** MUTATION. LED-07 FR-1 / LED-08 FR-1. */
export const saveReminderSettings = createAsyncThunk<
  ReminderSettings,
  ReminderSettingsPatch,
  Rejected
>('reminders/saveReminderSettings', async (patch, { rejectWithValue }) => {
  try {
    return await updateReminderSettings(patch);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reminders.settings.error'));
  }
});
