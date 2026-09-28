'use client';

import { memo, useCallback, useEffect, type RefObject } from 'react';

import {
  UbButton,
  UbShareSheet,
  UbSkeleton,
  UbStatusBanner,
  type UbShareChannel,
  type UbShareSheetLabels,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useNowMs } from 'src/hooks/useNowMs';
import { useShareFeedback } from 'src/hooks/useShareFeedback';
import { useTranslation } from 'src/hooks/useTranslation';
import { relativeTimeView } from 'src/utils/relativeTime';
import { toDialableNumber } from 'src/utils/share';

import {
  previewCleared,
  selectReminderPreview,
  selectReminderPreviewStatus,
} from '../redux/reminderSlice';
import { fetchReminderPreview, sendManualReminder } from '../redux/reminderThunk';
import { channelLabelId } from '../view-model/reminderDisplay';

import type { SendManualReminderArg } from '../types/reminder.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/reminders';
import 'src/i18n/catalogues/share';

/**
 * LED-06 — the reminder sheet, with the SERVER's words in it.
 *
 * Opening the sheet asks `POST /reminders/preview` for the text: the balance in
 * the message is read from the same row the khata shows (NTF-03 BR-2), and
 * nothing is recorded yet — a sheet opened and closed never reaches the log.
 *
 * The TAP is what records. WhatsApp, SMS and Call are real `<a>` elements, so
 * the browser opens the app first and `sendManualReminder` runs after; nothing
 * about the send can be popup-blocked, and a failure to record does not stop
 * the merchant's message. Copy and the platform sheet are not reminders — the
 * text left this app for somewhere it cannot see — and record nothing.
 *
 * The feedback still says "WhatsApp opened" (DEC-012): the merchant presses
 * send in another app, and this product must not claim it happened.
 */
export interface PartyReminderSheetProps {
  readonly partyId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly phone: string | null;
  readonly labels: UbShareSheetLabels;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

const CHANNEL_OF: Readonly<Partial<Record<UbShareChannel, SendManualReminderArg['channel']>>> = {
  whatsapp: 'whatsapp_manual',
  sms: 'sms_manual',
  call: 'call',
};

function PartyReminderSheetBase({
  partyId,
  open,
  onOpenChange,
  title,
  description,
  phone,
  labels,
  returnFocusRef,
}: Readonly<PartyReminderSheetProps>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const feedback = useShareFeedback();
  const nowMs = useNowMs();
  const preview = useAppSelector(selectReminderPreview);
  const status = useAppSelector(selectReminderPreviewStatus);

  /* Read when the sheet OPENS: "as of" is the moment the merchant sends it,
     and a khata left open overnight must not send yesterday's balance. */
  useEffect(() => {
    if (!open || !partyId) return;
    const request = dispatch(fetchReminderPreview(partyId));
    return () => {
      request.abort();
      dispatch(previewCleared());
    };
  }, [open, partyId, dispatch]);

  const onShared = useCallback(
    (channel: UbShareChannel) => {
      feedback.onShared(channel);
      const logged = CHANNEL_OF[channel];
      if (logged) void dispatch(sendManualReminder({ partyId, channel: logged }));
    },
    [feedback, dispatch, partyId]
  );

  const retry = useCallback(() => {
    void dispatch(fetchReminderPreview(partyId));
  }, [dispatch, partyId]);

  const ready = status === 'succeeded' && preview?.partyId === partyId;

  /* LED-06 FR-10 — a second reminder inside a day is allowed and said out
     loud first: a customer chased twice before lunch stops answering. */
  const recent = ready ? preview.warnings.find((w) => w.code === 'reminded_recently') : undefined;
  const when = recent ? relativeTimeView(recent.lastSentAt, nowMs) : null;
  const notice =
    recent && when ? (
      <UbStatusBanner
        tone="warning"
        title={t('reminders.sheet.recent', {
          when: t(when.id, when.values),
          channel: t(channelLabelId(recent.channel)),
        })}
      />
    ) : undefined;

  /* One sheet in every state, so the dialog is not remounted when the text
     arrives — focus stays inside it and ✕ still returns to ⋯ (QA D1). */
  const pending = ready ? undefined : status === 'failed' ? (
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
  );

  return (
    <UbShareSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      message={ready ? preview.text : ''}
      smsMessage={ready ? preview.smsText : undefined}
      notice={notice}
      pending={pending}
      callHref={phone ? `tel:${toDialableNumber(phone)}` : null}
      phone={phone}
      labels={labels}
      onShared={onShared}
      onFailed={feedback.onFailed}
      returnFocusRef={returnFocusRef}
    />
  );
}

export const PartyReminderSheet = memo(PartyReminderSheetBase);
