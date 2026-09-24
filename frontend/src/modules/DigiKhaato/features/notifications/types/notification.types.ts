/** NTF-01 §14 — one inbox row, as the domain sees it. */
export type NotificationCategory = 'money' | 'stock' | 'reminders' | 'team' | 'system';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface AppNotification {
  readonly id: string;
  readonly type: string;
  readonly category: NotificationCategory;
  readonly severity: NotificationSeverity;
  /** English, written at raise time — the fallback when the type has no key. */
  readonly title: string;
  readonly body: string;
  readonly count: number;
  /** An in-app path the server has already checked starts with `/`. */
  readonly route: string;
  readonly params: Readonly<Record<string, string>>;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface NotificationPage {
  readonly rows: readonly AppNotification[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly unreadCount: number;
}
