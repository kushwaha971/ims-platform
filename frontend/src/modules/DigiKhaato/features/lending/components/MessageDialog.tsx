'use client';

import { useEffect, useState } from 'react';

import { MessageCircle, MessageSquare, Phone } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDialog,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';

import { prepareLendingMessage, recordLendingMessage } from '../redux/lendingMessageThunk';
import { localClock, localDay, nextDay } from '../view-model/lendingDisplay';

import type {
  LendingMessageKind,
  MessageChannel,
  PreparedLendingMessage,
} from '../types/lending.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/lending';

const BUCKET_TONE = { overdue: 'error', due_today: 'warning', due_tomorrow: 'info' } as const;

/**
 * L03 (LEN-12) — a borrower's message, handled like a reminder: the fixed text
 * is prepared and shown read-only, and WhatsApp, SMS or Call opens on the
 * lender's own phone with it filled in; that tap is recorded so the office can
 * see who was told and when. The links are ready BEFORE the tap: a window
 * opened after a request returns is a pop-up the browser blocks.
 *
 * When the policy says no — before 08:00, after 19:00, or already reminded
 * today — there is no button to press, and the sheet says why and when it can
 * go (§8: a disabled Remind always says both).
 */
export function MessageDialog({
  loanId,
  name,
  kind,
  collectionId,
  onClose,
}: Readonly<{
  loanId: string;
  name: string;
  kind: LendingMessageKind;
  collectionId?: string;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const timezone = useAppSelector(selectTenantTimezone);
  const [message, setMessage] = useState<PreparedLendingMessage | null>(null);
  const [refusal, setRefusal] = useState('');

  useEffect(() => {
    const promise = dispatch(prepareLendingMessage({ loanId, kind, collectionId }));
    void promise.then((result) => {
      if (prepareLendingMessage.fulfilled.match(result)) setMessage(result.payload);
      else if (!result.meta.aborted)
        setRefusal(result.payload?.message ?? t('lending.messages.error.prepare'));
    });
    return () => promise.abort();
  }, [dispatch, loanId, kind, collectionId, t]);

  const record = (channel: MessageChannel) => {
    void dispatch(recordLendingMessage({ loanId, kind, channel, collectionId })).then((result) => {
      if (recordLendingMessage.fulfilled.match(result)) {
        dispatch(
          showSnackbar({
            severity: 'success',
            id: `lending.messages.recorded.${kind}`,
            params: { name: message?.recipient.name ?? name },
          })
        );
        onClose();
      } else if (result.payload) {
        dispatch(
          showSnackbar({
            severity: 'error',
            message: result.payload.message,
            requestId: result.payload.requestId,
          })
        );
      }
    });
  };

  /** "today at 08:00", "tomorrow at 08:00" or "07/10/2026 at 08:00". */
  const when = (iso: string | null): string => {
    if (!iso) return '';
    const today = todayInTenantTz(timezone ?? undefined);
    const day = localDay(iso);
    const time = localClock(iso);
    if (day === today) return t('lending.messages.when.today', { time });
    if (day === nextDay(today)) return t('lending.messages.when.tomorrow', { time });
    return t('lending.messages.when.on', { date: formatBusinessDate(day), time });
  };

  const guard = (m: PreparedLendingMessage): string => {
    const r = m.refusal;
    if (!r) return '';
    if (r.code === 'reminder_outside_window')
      return t('lending.messages.guard.window', {
        start: r.windowStart ?? '08:00',
        end: r.windowEnd ?? '19:00',
        when: when(r.nextAllowedAt),
      });
    if (r.code === 'reminder_cap_reached' && m.lastToday)
      // A receipt is capped per payment, and was not a reminder (L03 QA).
      return t(
        kind === 'receipt' ? 'lending.messages.guard.capReceipt' : 'lending.messages.guard.cap',
        {
          time: localClock(m.lastToday.at),
          when: when(r.nextAllowedAt),
        }
      );
    return r.message;
  };

  const ready = message?.allowed && message.recipient.hasMobile;

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(`lending.messages.title.${kind}`, { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          {ready && message.waUrl && (
            <UbActionLink
              href={message.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              icon={<MessageCircle className="h-4 w-4" aria-hidden />}
              onClick={() => record('whatsapp_manual')}
              data-testid="lending-message-whatsapp"
            >
              {t('lending.messages.openWhatsApp')}
            </UbActionLink>
          )}
        </>
      }
    >
      <UbStack gap={3} data-testid="lending-message">
        {refusal && (
          <UbText variant="body-sm" tone="warning">
            {refusal}
          </UbText>
        )}
        {!message && !refusal && (
          <UbText variant="body-sm" tone="tertiary">
            {t('lending.messages.preparing')}
          </UbText>
        )}
        {message && (
          <>
            <UbStack direction="row" gap={2} align="center" justify="between" wrap>
              <UbText variant="caption" tone="tertiary">
                {t('lending.messages.to', { name: message.recipient.name })}
              </UbText>
              {message.bucket && (
                <UbStatusBadge
                  tone={BUCKET_TONE[message.bucket]}
                  label={t(`lending.messages.bucket.${message.bucket}`)}
                />
              )}
            </UbStack>
            <UbText
              variant="body-sm"
              className="whitespace-pre-line rounded-control bg-surface-sunken p-3"
              data-testid="lending-message-text"
            >
              {message.text}
            </UbText>
            {!message.allowed && (
              <UbText variant="body-sm" tone="warning" data-testid="lending-message-guard">
                {guard(message)}
              </UbText>
            )}
            {message.allowed && message.lastToday && (
              <UbText variant="caption" tone="tertiary">
                {t('lending.messages.lastToday', {
                  time: localClock(message.lastToday.at),
                  channel: t(`lending.messages.channel.${message.lastToday.channel}`),
                })}
              </UbText>
            )}
            {!message.recipient.hasMobile && (
              <UbText variant="body-sm" tone="warning">
                {t('lending.messages.noMobile', { name: message.recipient.name })}
              </UbText>
            )}
            {ready && (
              <UbStack direction="row" gap={2} wrap>
                <UbActionLink
                  href={message.smsUrl}
                  size="sm"
                  icon={<MessageSquare className="h-4 w-4" aria-hidden />}
                  onClick={() => record('sms_manual')}
                >
                  {t('lending.messages.openSms')}
                </UbActionLink>
                <UbActionLink
                  href={message.telUrl}
                  size="sm"
                  icon={<Phone className="h-4 w-4" aria-hidden />}
                  onClick={() => record('call')}
                >
                  {t('lending.messages.call')}
                </UbActionLink>
              </UbStack>
            )}
          </>
        )}
      </UbStack>
    </UbDialog>
  );
}
