'use client';

import { memo, useCallback, useMemo } from 'react';

import { MessageCircle } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDialog,
  UbProgress,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import {
  bulkClosed,
  selectBulkDone,
  selectBulkItems,
  selectBulkPassed,
  selectBulkSkipped,
  selectBulkStatus,
} from '../redux/reminderSlice';
import { markReminderStatus, sendBulkStep } from '../redux/reminderThunk';
import { skipReasonId } from '../view-model/reminderDisplay';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/reminders';

/**
 * LED-06 FR-7 — "Remind all", one customer at a time.
 *
 * A browser opens ONE window per tap: a loop of `window.open` over forty
 * parties opens one WhatsApp chat and has the other thirty-nine eaten by the
 * popup blocker, silently. So the server prepares every link up front
 * (`POST /reminders/bulk` — a scheduled row and a ready `wa.me` URL per
 * party), and this dialog walks them: each step is a real `<a>` the merchant
 * taps, which is a fresh user gesture every time. The tap marks that row sent
 * and brings up the next party; Skip dismisses it. Closing part-way leaves
 * the untapped rows scheduled and unsent, which is the truth.
 */
export interface BulkReminderDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function BulkReminderDialogBase({ open, onClose }: Readonly<BulkReminderDialogProps>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectBulkItems);
  const skipped = useAppSelector(selectBulkSkipped);
  const done = useAppSelector(selectBulkDone);
  const passed = useAppSelector(selectBulkPassed);
  const status = useAppSelector(selectBulkStatus);

  const handled = useMemo(() => new Set([...done, ...passed]), [done, passed]);
  const current = items.find((item) => !handled.has(item.reminderId)) ?? null;
  const position = items.length - items.filter((item) => !handled.has(item.reminderId)).length;

  const close = useCallback(
    (next: boolean) => {
      if (next) return;
      dispatch(bulkClosed());
      onClose();
    },
    [dispatch, onClose]
  );

  const onTapped = useCallback(() => {
    if (current) void dispatch(sendBulkStep(current.reminderId));
  }, [dispatch, current]);

  const onSkip = useCallback(() => {
    if (current)
      void dispatch(markReminderStatus({ reminderId: current.reminderId, status: 'dismissed' }));
  }, [dispatch, current]);

  const finished = status === 'succeeded' && current === null;

  return (
    <UbDialog
      open={open}
      onOpenChange={close}
      title={t('reminders.bulk.title')}
      description={
        status === 'succeeded' && items.length > 0
          ? t('reminders.bulk.progress', { done: position, total: items.length })
          : undefined
      }
      closeLabel={t('common.action.close')}
      footer={
        finished ? (
          <UbButton variant="primary" onClick={() => close(false)}>
            {t('reminders.bulk.finish')}
          </UbButton>
        ) : undefined
      }
    >
      {status === 'loading' && (
        <UbSkeleton variant="text" count={4} label={t('reminders.bulk.preparing')} />
      )}

      {status === 'succeeded' && (
        <UbStack gap={4}>
          {items.length > 0 && (
            <UbProgress
              used={position}
              limit={items.length}
              ariaLabel={t('reminders.bulk.progress', { done: position, total: items.length })}
            />
          )}

          {current && (
            <UbStack gap={3} data-testid="bulk-step">
              <UbStack direction="row" justify="between" align="baseline" gap={2}>
                <UbText variant="body-medium">{current.partyName}</UbText>
                <UbText variant="body-medium" className="ds-num">
                  {formatInr(current.balance)}
                </UbText>
              </UbStack>
              <UbText
                variant="body-sm"
                tone="secondary"
                className="max-h-32 overflow-y-auto whitespace-pre-line break-words rounded-control bg-surface-sunken px-3 py-2"
              >
                {current.text}
              </UbText>
              <UbStack direction="row" gap={2}>
                <UbActionLink
                  href={current.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="primary"
                  className="flex-1"
                  icon={<MessageCircle aria-hidden className="h-4 w-4" />}
                  onClick={onTapped}
                >
                  {t('reminders.bulk.send', { name: current.partyName })}
                </UbActionLink>
                <UbButton variant="ghost" onClick={onSkip}>
                  {t('reminders.bulk.skip')}
                </UbButton>
              </UbStack>
            </UbStack>
          )}

          {finished && (
            <UbText variant="body">
              {t('reminders.bulk.summary', { sent: done.length, skipped: passed.length })}
            </UbText>
          )}

          {skipped.length > 0 && (
            <UbStack gap={1} data-testid="bulk-skipped">
              <UbText variant="body-sm-medium" tone="secondary">
                {t('reminders.bulk.notIncluded', { count: skipped.length })}
              </UbText>
              {Array.from(new Set(skipped.map((s) => s.reason))).map((reason) => (
                <UbText key={reason} variant="caption" tone="tertiary">
                  {t(skipReasonId(reason), {
                    count: skipped.filter((s) => s.reason === reason).length,
                  })}
                </UbText>
              ))}
            </UbStack>
          )}
        </UbStack>
      )}

      {status === 'failed' && <UbText tone="error">{t('reminders.error.send')}</UbText>}
    </UbDialog>
  );
}

export const BulkReminderDialog = memo(BulkReminderDialogBase);
