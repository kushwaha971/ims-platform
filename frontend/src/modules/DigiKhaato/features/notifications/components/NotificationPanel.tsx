'use client';

import { useCallback, useEffect, type RefObject } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbBox,
  UbButton,
  UbDialog,
  UbEmptyState,
  UbPressable,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useNowMs } from 'src/hooks/useNowMs';
import { useTranslation } from 'src/hooks/useTranslation';
import { relativeTimeView } from 'src/utils/relativeTime';

import {
  selectNotifications,
  selectNotificationsCursor,
  selectNotificationsHasMore,
  selectNotificationsStatus,
  selectUnreadCount,
} from '../redux/notificationSlice';
import {
  fetchNotifications,
  readAllNotifications,
  readNotification,
} from '../redux/notificationThunk';
import { bodyId, safeRoute, titleView } from '../view-model/notificationDisplay';

import type { AppNotification } from '../types/notification.types';

/**
 * NTF-01 FR-4 — the inbox, as a dialog: a centred panel on a laptop and a
 * bottom sheet on a phone (`UbDialog` is both, and is already on every route,
 * where a Radix popover would add its own chunk).
 *
 * Tapping a row reads it, closes the panel and goes where it points (FR-7).
 * Mark all read is disabled at zero (§7). There is no "See all" link: the full
 * `/notifications` page is not built, and a link to it would be a control for
 * a feature that is not there.
 */
export interface NotificationPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

const SEVERITY_DOT: Readonly<Record<AppNotification['severity'], string>> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-error-bright',
};

export function NotificationPanel({
  open,
  onOpenChange,
  returnFocusRef,
}: Readonly<NotificationPanelProps>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const rows = useAppSelector(selectNotifications);
  const status = useAppSelector(selectNotificationsStatus);
  const hasMore = useAppSelector(selectNotificationsHasMore);
  const cursor = useAppSelector(selectNotificationsCursor);
  const unread = useAppSelector(selectUnreadCount) ?? 0;
  const nowMs = useNowMs();

  useEffect(() => {
    if (open) void dispatch(fetchNotifications(null));
  }, [open, dispatch]);

  const openRow = useCallback(
    (row: AppNotification) => {
      if (!row.isRead) void dispatch(readNotification(row.id));
      onOpenChange(false);
      router.push(safeRoute(row.route));
    },
    [dispatch, onOpenChange, router]
  );

  const markAll = useCallback(() => void dispatch(readAllNotifications()), [dispatch]);
  const loadMore = useCallback(() => void dispatch(fetchNotifications(cursor)), [dispatch, cursor]);

  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('notifications.title')}
      closeLabel={t('common.action.close')}
      returnFocusRef={returnFocusRef}
    >
      <UbStack gap={3} data-testid="notification-panel">
        <UbBox className="flex justify-end">
          <UbButton variant="ghost" size="sm" onClick={markAll} disabled={unread === 0}>
            {t('notifications.markAllRead')}
          </UbButton>
        </UbBox>

        {status === 'loading' && rows.length === 0 ? (
          <UbSkeleton variant="list" />
        ) : status === 'failed' && rows.length === 0 ? (
          <UbEmptyState
            variant="error"
            title={t('notifications.error.title')}
            description={t('notifications.error.body')}
            action={
              <UbButton variant="secondary" onClick={() => void dispatch(fetchNotifications(null))}>
                {t('common.action.retry')}
              </UbButton>
            }
          />
        ) : rows.length === 0 ? (
          <UbEmptyState
            variant="firstUse"
            title={t('notifications.empty')}
            description={t('notifications.emptyHint')}
          />
        ) : (
          <UbStack
            gap={0}
            as="ul"
            className="max-h-[60vh] divide-y divide-border-hairline overflow-y-auto"
          >
            {rows.map((row) => {
              const title = titleView(row);
              const body = bodyId(row);
              const when = relativeTimeView(row.createdAt, nowMs);
              return (
                <UbBox as="li" key={row.id}>
                  <UbPressable
                    onClick={() => openRow(row)}
                    className={`flex w-full items-start gap-3 px-2 py-3 text-left ${row.isRead ? '' : 'bg-accent-quiet'}`}
                    data-testid="notification-row"
                  >
                    <UbBox
                      as="span"
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[row.severity]}`}
                    />
                    <UbStack gap={0} className="min-w-0 flex-1">
                      <UbText
                        variant={row.isRead ? 'body-sm' : 'body-sm-medium'}
                        className="line-clamp-2"
                      >
                        {title.id ? t(title.id, title.values) : title.fallback}
                      </UbText>
                      {body && (
                        <UbText variant="caption" tone="tertiary" className="line-clamp-2">
                          {t(body)}
                        </UbText>
                      )}
                      <UbText variant="caption" tone="muted">
                        {t(when.id, when.values)}
                      </UbText>
                    </UbStack>
                    {!row.isRead && (
                      <UbText as="span" variant="caption" tone="accent" className="shrink-0">
                        {t('notifications.unreadDot')}
                      </UbText>
                    )}
                  </UbPressable>
                </UbBox>
              );
            })}
          </UbStack>
        )}

        {hasMore && (
          <UbButton variant="ghost" size="sm" onClick={loadMore} busy={status === 'refreshing'}>
            {t('notifications.loadOlder')}
          </UbButton>
        )}
      </UbStack>
    </UbDialog>
  );
}
