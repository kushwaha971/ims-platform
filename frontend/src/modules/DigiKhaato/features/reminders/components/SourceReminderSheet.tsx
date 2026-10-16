'use client';

import { useCallback, useEffect } from 'react';

import { DEFAULT_TENANT_TIMEZONE } from 'src/constants';
import {
  UbButton,
  UbShareSheet,
  UbSkeleton,
  UbStatusBanner,
  type UbShareChannel,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useShareFeedback } from 'src/hooks/useShareFeedback';
import { useShareSheetLabels } from 'src/hooks/useShareSheetLabels';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { toDialableNumber } from 'src/utils/share';

import {
  selectSourcePreview,
  selectSourcePreviewStatus,
  sourcePreviewCleared,
} from '../redux/moduleReminderSlice';
import { fetchSourcePreview, sendSourceReminder } from '../redux/moduleReminderThunk';
import { nextAllowedLabel } from '../view-model/moduleReminderDisplay';

import type { ReminderSourceRef } from '../types/reminder.types';

import 'src/i18n/catalogues/reminders';
import 'src/i18n/catalogues/share';

const CHANNEL_OF: Readonly<
  Partial<Record<UbShareChannel, 'whatsapp_manual' | 'sms_manual' | 'call'>>
> = {
  whatsapp: 'whatsapp_manual',
  sms: 'sms_manual',
  call: 'call',
};

/**
 * A7 (PLT-X06 §2 flow 2) — the sheet for a reminder about one module record:
 * the server's text, which the merchant may change before it goes (WP-04; the
 * words that left are what `/send` logs), addressed to the recipient, with
 * WhatsApp / SMS / Call.
 *
 * Outside the module's hours the channels are REPLACED by the rule and the next
 * allowed time, and nothing can be recorded (§2: "the buttons are replaced").
 * The server refuses a late tap too; this is so the merchant is told before
 * the tap rather than after it.
 */
export function SourceReminderSheet({
  source,
  title,
  open,
  onOpenChange,
}: Readonly<{
  source: ReminderSourceRef;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>): React.JSX.Element {
  const { t, d } = useTranslation();
  const dispatch = useAppDispatch();
  const feedback = useShareFeedback();
  const timeZone = useAppSelector(selectTenantTimezone) ?? DEFAULT_TENANT_TIMEZONE;
  const preview = useAppSelector(selectSourcePreview);
  const status = useAppSelector(selectSourcePreviewStatus);
  const { sourceType, sourceId } = source;

  useEffect(() => {
    if (!open) return undefined;
    const request = dispatch(fetchSourcePreview({ sourceType, sourceId }));
    return () => {
      request.abort();
      dispatch(sourcePreviewCleared());
    };
  }, [open, sourceType, sourceId, dispatch]);

  const onShared = useCallback(
    (channel: UbShareChannel, text: string) => {
      feedback.onShared(channel);
      const logged = CHANNEL_OF[channel];
      // MSG-10 — the words that left, after any edit, are what the log keeps.
      if (logged)
        void dispatch(
          sendSourceReminder({
            source: { sourceType, sourceId },
            channel: logged,
            text: text || undefined,
          })
        );
    },
    [feedback, dispatch, sourceType, sourceId]
  );
  const retry = useCallback(() => {
    void dispatch(fetchSourcePreview({ sourceType, sourceId }));
  }, [dispatch, sourceType, sourceId]);

  const labels = useShareSheetLabels(true);

  const ready = status === 'succeeded' && preview?.sourceId === sourceId;
  const refused = ready && !preview.allowed;
  const pending = !ready ? (
    status === 'failed' ? (
      <UbStatusBanner
        tone="error"
        title={t('reminders.sheet.error')}
        action={
          <UbButton variant="secondary" size="sm" onClick={retry}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    ) : (
      <UbSkeleton variant="text" count={4} label={t('reminders.sheet.loading')} />
    )
  ) : refused ? (
    <UbStatusBanner
      tone="info"
      title={t('reminders.module.notNow')}
      description={
        preview.nextAllowedAt ? nextAllowedLabel(t, d, preview.nextAllowedAt, timeZone) : undefined
      }
    />
  ) : undefined;

  const phone = ready ? preview.mobile : null;
  return (
    <UbShareSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        ready && preview.recipient
          ? t('reminders.module.toRecipient', { name: preview.recipient.name })
          : undefined
      }
      message={ready ? preview.text : ''}
      smsMessage={ready ? preview.smsText : undefined}
      pending={pending}
      callHref={phone ? `tel:${toDialableNumber(phone)}` : null}
      phone={phone}
      labels={labels}
      onShared={onShared}
      onFailed={feedback.onFailed}
    />
  );
}
