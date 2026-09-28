import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notificationService';

import type { NotificationPage } from '../types/notification.types';

type Rejected = { rejectValue: ApiErrorShape };

/** QUERY. The bell's number — polled every 60 s while the tab is visible (FR-8). */
export const fetchUnreadCount = createAsyncThunk<number, void, Rejected>(
  'notifications/fetchUnreadCount',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await getUnreadCount(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'notifications.error.title'));
    }
  }
);

/** QUERY. One page of the inbox; `null` is the first page. */
export const fetchNotifications = createAsyncThunk<NotificationPage, string | null, Rejected>(
  'notifications/fetchNotifications',
  async (cursor, { signal, rejectWithValue }) => {
    try {
      return await listNotifications(cursor, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'notifications.error.title'));
    }
  }
);

/** MUTATION. FR-8 — tapping a row reads it. */
export const readNotification = createAsyncThunk<string, string, Rejected>(
  'notifications/readNotification',
  async (id, { rejectWithValue }) => {
    try {
      await markNotificationRead(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'notifications.error.title'));
    }
  }
);

/** MUTATION. FR-8 — Mark all read. */
export const readAllNotifications = createAsyncThunk<number, void, Rejected>(
  'notifications/readAllNotifications',
  async (_arg, { rejectWithValue }) => {
    try {
      return await markAllNotificationsRead();
    } catch (error) {
      return rejectWithValue(toApiError(error, 'notifications.error.title'));
    }
  }
);
