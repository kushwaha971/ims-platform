'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import {
  UbAmount,
  UbButton,
  UbDialog,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

import { PartyWriteOffForm } from './PartyWriteOffForm';

import type { ArchiveStage, BlockedBalance } from '../hooks/usePartyArchive';

/**
 * PTY-04's confirmation, and the state the server puts it in when the party
 * still owes something.
 *
 * ── One dialog, two bodies, swapped in place ───────────────────────────────
 * FR-10 is explicit that the blocked case must not open a SECOND modal. The
 * merchant asked one question — can I file this person away — and the answer is
 * no and here is why; stacking a dialog on a dialog makes them dismiss two
 * things to get back to where they were, and on a phone the first one is
 * invisible underneath.
 *
 * ── The consequence list is short, and that is the ledger's fault ──────────
 * FR-6 wants it rendered from server-provided counts: "{n} transactions stay
 * readable", "{m} scheduled reminders will be cancelled". Both count rows in
 * tables the `ledger` app does not have. A bullet reading "0 transactions stay
 * readable" would be a statement about this party made by code that has never
 * looked at a transaction, so the bullets that survive are the two that are
 * true without counting anything: nothing is deleted, and they stop appearing
 * in the list.
 *
 * ── The two ways out (FR-10) ───────────────────────────────────────────────
 * Blocked offers Record payment and Write off, now that the ledger exists.
 * Record payment hands over to LED-01's drawer, in the direction that settles
 * the balance. Write off swaps THIS dialog to a form — reason, date, and an
 * acknowledgement the destructive button waits for (T-PTY-04-14) — because it
 * is a financial decision taken once per party, never in bulk (FR-9), and the
 * one thing a merchant must not do by holding Enter.
 */
export interface PartyArchiveDialogProps {
  readonly t: TranslateFn;
  readonly name: string;
  readonly stage: ArchiveStage;
  readonly blocked: BlockedBalance | null;
  readonly error: ApiErrorShape | null;
  readonly onConfirm: (reason: string) => void;
  readonly onClose: () => void;
  /** Where `saving` began, so the right body stays on screen while it runs. */
  readonly savingFrom?: ArchiveStage;
  readonly canWriteOff?: boolean;
  readonly onStartWriteOff?: () => void;
  readonly onCancelWriteOff?: () => void;
  readonly onConfirmWriteOff?: (values: { reason: string; entryDate: string }) => void;
  /** Hand over to the entry drawer, in the direction that settles the balance. */
  readonly onRecordPayment?: () => void;
}

const WRITE_OFF_REASON_MIN = 3;

function PartyArchiveDialogBase({
  t,
  name,
  stage,
  blocked,
  error,
  onConfirm,
  onClose,
  savingFrom = 'confirm',
  canWriteOff = false,
  onStartWriteOff,
  onCancelWriteOff,
  onConfirmWriteOff,
  onRecordPayment,
}: Readonly<PartyArchiveDialogProps>) {
  const [reason, setReason] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const timezone = useAppSelector(selectTenantTimezone);
  /* The tenant's today, not the device's (LED-01 EC-8): a write-off entered at
     11.50 p.m. IST on a phone set to UTC must not land on yesterday. */
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const [writeOffDate, setWriteOffDate] = useState('');
  const saving = stage === 'saving';
  const shown: ArchiveStage = saving ? savingFrom : stage;
  const canSubmitWriteOff = writeOffReason.trim().length >= WRITE_OFF_REASON_MIN && acknowledged;

  const handleConfirmWriteOff = useCallback(
    () => onConfirmWriteOff?.({ reason: writeOffReason.trim(), entryDate: writeOffDate || today }),
    [onConfirmWriteOff, writeOffReason, writeOffDate, today]
  );

  const handleConfirm = useCallback(() => onConfirm(reason.trim()), [onConfirm, reason]);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving) onClose();
    },
    [onClose, saving]
  );

  if (stage === 'closed') return null;

  const isBlocked = shown === 'blocked' && blocked !== null;
  const isWriteOff = shown === 'writeOff' && blocked !== null;
  const amountText = blocked ? formatAmount(blocked.amount) : '';

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={
        isWriteOff
          ? t('parties.writeOff.title', { amount: amountText, name })
          : isBlocked
            ? t(
                blocked.label === 'receivable'
                  ? 'parties.archive.blocked.title'
                  : 'parties.archive.blocked.titleGive',
                { name }
              )
            : t('parties.archive.title', { name })
      }
      closeLabel={t('common.action.close')}
      /* A destructive decision does not dismiss on a backdrop tap: the merchant
         has to say yes or no, and a stray tap outside the box is neither. */
      dismissOnBackdrop={false}
      footer={
        isWriteOff ? (
          <>
            <UbButton variant="secondary" onClick={onCancelWriteOff} disabled={saving} autoFocus>
              {t('parties.writeOff.back')}
            </UbButton>
            {/* Disabled until a reason and the acknowledgement (T-PTY-04-14).
                Outlined danger, like every destructive action here. */}
            <UbButton
              variant="destructive"
              onClick={handleConfirmWriteOff}
              disabled={!canSubmitWriteOff}
              busy={saving}
              busyLabel={t('parties.writeOff.saving')}
            >
              {t('parties.writeOff.confirm')}
            </UbButton>
          </>
        ) : (
          <>
            {/* Cancel first and Cancel focused. The destructive action requires a
                deliberate move to reach, so a merchant holding Enter cannot
                archive anybody by accident. */}
            <UbButton variant="secondary" onClick={onClose} disabled={saving} autoFocus>
              {t('common.action.cancel')}
            </UbButton>
            {isBlocked && onRecordPayment && (
              <UbButton variant="outlineNeutral" onClick={onRecordPayment}>
                {t('parties.archive.recordPayment')}
              </UbButton>
            )}
            {isBlocked && canWriteOff && onStartWriteOff && (
              <UbButton variant="destructive" onClick={onStartWriteOff}>
                {t('parties.writeOff.action', { amount: amountText })}
              </UbButton>
            )}
            {!isBlocked && (
              /* Outlined danger, never a filled red block: a destructive action
                 should be reachable and unmistakable, not shouted. */
              <UbButton
                variant="destructive"
                onClick={handleConfirm}
                busy={saving}
                busyLabel={t('parties.archive.saving')}
              >
                {t('parties.archive.action')}
              </UbButton>
            )}
          </>
        )
      }
    >
      <UbStack gap={4}>
        {isWriteOff && blocked ? (
          <PartyWriteOffForm
            t={t}
            name={name}
            blocked={blocked}
            amountText={amountText}
            today={today}
            saving={saving}
            reason={writeOffReason}
            onReasonChange={setWriteOffReason}
            entryDate={writeOffDate || today}
            onEntryDateChange={setWriteOffDate}
            acknowledged={acknowledged}
            onAcknowledgedChange={setAcknowledged}
          />
        ) : isBlocked ? (
          <UbStack gap={3}>
            <UbAmount
              value={blocked.amount}
              size="lg"
              tone={blocked.label === 'receivable' ? 'receivable' : 'payable'}
              label={t(
                blocked.label === 'receivable'
                  ? 'parties.list.balance.receivable'
                  : 'parties.list.balance.payable'
              )}
            />
            <UbText variant="body-sm">{t('parties.archive.blocked.body')}</UbText>
            <UbText variant="caption" tone="tertiary">
              {t(
                canWriteOff
                  ? 'parties.archive.blocked.options'
                  : 'parties.archive.blocked.optionsNoWriteOff'
              )}
            </UbText>
          </UbStack>
        ) : (
          <UbStack gap={3}>
            <UbText variant="body-sm">{t('parties.archive.body')}</UbText>
            <UbText variant="body-sm" tone="tertiary">
              {t('parties.archive.consequence.pickers')}
            </UbText>
            <UbTextInput
              value={reason}
              onChange={setReason}
              type="text"
              maxLength={160}
              aria-label={t('parties.archive.reason')}
              placeholder={t('parties.archive.reason')}
              disabled={saving}
            />
          </UbStack>
        )}

        {error && (
          <UbStatusBanner
            tone="error"
            title={error.message}
            description={
              error.requestId ? `${t('common.error.reference')} ${error.requestId}` : undefined
            }
          />
        )}
      </UbStack>
    </UbDialog>
  );
}

PartyArchiveDialogBase.displayName = 'PartyArchiveDialog';
export const PartyArchiveDialog = memo(PartyArchiveDialogBase);
