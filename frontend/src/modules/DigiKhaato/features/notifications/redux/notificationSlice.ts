import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import {
  fetchNotifications,
  fetchUnreadCount,
  readAllNotifications,
  readNotification,
} from './notificationThunk';

import type { AppNotification } from '../types/notification.types';

/**
 * NTF-01 — the bell's count and the panel's rows.
 *
 * Injected lazily (CR-134) by the bell's own module, which only `(app)` routes
 * load: the login screen does not carry an inbox. `unreadCount` is `null`
 * until the first answer so the badge never flickers a 0 (§9).
 */
export interface NotificationState {
  unreadCount: number | null;
  items: AppNotification[];
  nextCursor: string | null;
  hasMore: boolean;
  status: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: NotificationState = {
  unreadCount: null,
  items: [],
  nextCursor: null,
  hasMore: false,
  status: 'idle',
  stale: false,
  staleUrgency: null,
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    resetNotifications: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<NotificationState>('notifications')(builder);

    builder
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(fetchNotifications.pending, (state, action) => {
        state.status =
          action.meta.arg === null && state.items.length === 0 ? 'loading' : 'refreshing';
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        const rows = action.payload.rows as Draft<AppNotification>[];
        state.items = action.meta.arg === null ? rows : [...state.items, ...rows];
        state.nextCursor = action.payload.nextCursor;
        state.hasMore = action.payload.hasMore;
        // §5 — the badge and the list agree, from the same predicate.
        state.unreadCount = action.payload.unreadCount;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
      })
      .addCase(readNotification.fulfilled, (state, action) => {
        const row = state.items.find((n) => n.id === action.payload);
        if (row && !row.isRead) {
          row.isRead = true;
          state.unreadCount = Math.max((state.unreadCount ?? 1) - 1, 0);
        }
      })
      .addCase(readAllNotifications.fulfilled, (state) => {
        state.items.forEach((n) => {
          n.isRead = true;
        });
        state.unreadCount = 0;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { resetNotifications } = notificationSlice.actions;
export const notificationReducer = notificationSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof notificationSlice> {}
}

const injected = notificationSlice.injectInto(rootReducer);
const slice$ = (state: RootState): NotificationState => injected.selectSlice(state);

export const selectUnreadCount = (s: RootState): number | null => slice$(s).unreadCount;
export const selectNotifications = (s: RootState): readonly AppNotification[] => slice$(s).items;
export const selectNotificationsHasMore = (s: RootState): boolean => slice$(s).hasMore;
export const selectNotificationsCursor = (s: RootState): string | null => slice$(s).nextCursor;
export const selectNotificationsStatus = (s: RootState): RequestStatus => slice$(s).status;
