'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { MessageCircle } from 'lucide-react';

import {
  finalMessage,
  isBlankMessage,
  UbActionLink,
  UbButton,
  UbDialog,
  UbMessageBox,
  UbProgress,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useShareSheetLabels } from 'src/hooks/useShareSheetLabels';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';
import { buildWhatsAppUrl } from 'src/utils/share';

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
 *
 * WP-04 MSG-07/08 — each customer's words sit in the same editable box the
 * share sheet uses, before their link is tapped. Unchanged, the link is the
 * server's own; changed, it is rebuilt from the edit and the party's number,
 * and the tap sends those words to `/send` so the log keeps what went. An
 * edit belongs to one customer: the next one starts from their own default.
 * A blank message offers no link and says why.
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
  const labels = useShareSheetLabels();
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});

  const handled = useMemo(() => new Set([...done, ...passed]), [done, passed]);
  const current = items.find((item) => !handled.has(item.reminderId)) ?? null;
  const position = items.length - items.filter((item) => !handled.has(item.reminderId)).length;

  const close = useCallback(
    (next: boolean) => {
      if (next) return;
      setDrafts({});
      dispatch(bulkClosed());
      onClose();
    },
    [dispatch, onClose]
  );

  const draft = current ? (drafts[current.reminderId] ?? null) : null;
  const text = current ? finalMessage(current.text, draft) : '';
  const blank = isBlankMessage(text);
  const href =
    current && draft !== null && draft !== current.text
      ? buildWhatsAppUrl(text, current.mobile)
      : current?.waUrl;

  const onDraftChange = useCallback(
    (next: string | null) => {
      if (!current) return;
      const id = current.reminderId;
      setDrafts(({ [id]: _old, ...rest }) => (next === null ? rest : { ...rest, [id]: next }));
    },
    [current]
  );

  const onTapped = useCallback(() => {
    if (current) void dispatch(sendBulkStep({ reminderId: current.reminderId, text }));
  }, [dispatch, current, text]);

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
              <UbMessageBox
                key={current.reminderId}
                message={current.text}
                draft={draft}
                onDraftChange={onDraftChange}
                labels={labels}
                rows={4}
              />
              <UbStack direction="row" gap={2}>
                {blank || !href ? (
                  <UbButton
                    variant="primary"
                    className="flex-1"
                    disabled
                    icon={<MessageCircle aria-hidden className="h-4 w-4" />}
                  >
                    {t('reminders.bulk.send', { name: current.partyName })}
                  </UbButton>
                ) : (
                  <UbActionLink
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    className="flex-1"
                    icon={<MessageCircle aria-hidden className="h-4 w-4" />}
                    onClick={onTapped}
                  >
                    {t('reminders.bulk.send', { name: current.partyName })}
                  </UbActionLink>
                )}
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
