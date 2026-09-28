import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type { AppNotification, NotificationPage } from '../types/notification.types';

/**
 * Part 19 §19.3.4 — NTF-01's four requests. The count is polled, so it never
 * toasts: a failed poll on a flaky connection is not an error the merchant
 * asked about, and the bell simply keeps its last figure (§9 "Error: badge
 * hidden, silent").
 */

interface NotificationWire {
  readonly id: string;
  readonly type: string;
  readonly category: AppNotification['category'];
  readonly severity: AppNotification['severity'];
  readonly title: string;
  readonly body: string;
  readonly count: number;
  readonly route: string;
  readonly params: Record<string, string>;
  readonly is_read: boolean;
  readonly created_at: string;
}

const toNotification = (row: NotificationWire): AppNotification => ({
  id: row.id,
  type: row.type,
  category: row.category,
  severity: row.severity,
  title: row.title,
  body: row.body,
  count: row.count,
  route: row.route,
  params: row.params,
  isRead: row.is_read,
  createdAt: row.created_at,
});

export const getUnreadCount = async (signal?: AbortSignal): Promise<number> => {
  const response = await api.get<{ data: { count: number } }>(
    API_PATHS.NOTIFICATIONS_UNREAD_COUNT,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.count;
};

export const listNotifications = async (
  cursor: string | null,
  signal?: AbortSignal
): Promise<NotificationPage> => {
  const response = await api.get<{
    data: readonly NotificationWire[];
    meta: { next_cursor: string | null; has_more: boolean; unread_count: number };
  }>(
    `${API_PATHS.NOTIFICATIONS}${toQueryString({ cursor: cursor ?? undefined, limit: 25 })}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map(toNotification),
    nextCursor: meta.next_cursor,
    hasMore: meta.has_more,
    unreadCount: meta.unread_count,
  };
};

export const markNotificationRead = async (id: string): Promise<void> => {
  await api.post(API_PATHS.NOTIFICATION_READ(id));
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const response = await api.post<{ data: { marked: number } }>(
    API_PATHS.NOTIFICATIONS_READ_ALL,
    {}
  );
  return response.data.data.marked;
};
