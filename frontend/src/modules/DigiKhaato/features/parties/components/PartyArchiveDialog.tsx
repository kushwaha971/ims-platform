'use client';

import { memo, useCallback, useEffect, useId, useMemo, useState, type RefObject } from 'react';

import {
  formatRequestReference,
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
  /** Focus target on close when the opener is gone (QA D1) — the khata's ⋯. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
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
  returnFocusRef,
}: Readonly<PartyArchiveDialogProps>) {
  const [reason, setReason] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');
  /* The acknowledgement is given FOR a figure, not in general. When a write-off
     comes back `balance_changed` the dialog shows the new amount, and a tick
     left over from the old one would let the merchant confirm a sum they never
     ticked — so the tick is stored against the figure and lapses when it moves. */
  const [acknowledgedFigure, setAcknowledgedFigure] = useState<string | null>(null);
  const figure = blocked ? `${blocked.label}:${blocked.magnitude}` : null;
  const acknowledged = figure !== null && acknowledgedFigure === figure;
  const setAcknowledged = useCallback(
    (value: boolean) => setAcknowledgedFigure(value ? figure : null),
    [figure]
  );
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

  const isBlocked = stage !== 'closed' && shown === 'blocked' && blocked !== null;
  const isWriteOff = stage !== 'closed' && shown === 'writeOff' && blocked !== null;

  /* M4 — focus is moved on purpose when the body swaps to "blocked".
     The Archive button the merchant just pressed is unmounted by the swap, so
     focus fell to <body>; the browser's sequential-focus starting point stayed
     where that button had been — just after Cancel — and the first Tab landed
     on "Write off ₹…", where Enter opens the write-off. Cancel's `autoFocus`
     cannot help: Cancel was already mounted and does not mount again. So focus
     goes to the explanation itself (`tabIndex={-1}`: focusable by script, not
     a Tab stop). A screen reader reads why the archive was refused, and the
     first Tab goes to the first action in reading order — Cancel — so the
     destructive Write off is never the first thing reached. The same holds on
     the way back from the write-off form, whose Back button unmounts too. */
  const blockedBodyId = useId();
  useEffect(() => {
    if (isBlocked) document.getElementById(blockedBodyId)?.focus();
  }, [isBlocked, blockedBodyId]);

  if (stage === 'closed') return null;
  /* The magnitude, never the signed balance: every string this feeds already
     says the direction in words ("You owe", "what you owe {name}"), so a
     payable printed "Write off ₹-500.00" (FB-1). `UbAmount` below keeps the
     signed figure, because it paints direction itself. */
  const amountText = blocked ? formatAmount(blocked.magnitude) : '';

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
      returnFocusRef={returnFocusRef}
      /* D-L6 — three actions, so the footer stacks in DOM order on a phone.
         Reversed, the sheet showed Record payment · Write off · Cancel top to
         bottom while Tab went Cancel → Write off → Record payment: from the
         bottom button upwards. As written it reads Cancel, Write off, Record
         payment on both — top to bottom on a phone, left to right on a laptop
         — and Record payment, the move that settles the balance, is the bottom
         button of the sheet, the one under the thumb. The destructive Write
         off is still never the first thing offered. */
      footerOrder={isBlocked ? 'as-written' : undefined}
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
            {/* Write off BEFORE Record payment in the DOM, and the order is
                the point. The blocked footer stacks as written (D-L6), so the
                DOM order is the order everywhere: on a laptop Cancel · Write
                off · Record payment with the primary at the right (UAT), and
                on a phone the same top to bottom, Record payment the bottom
                button of the sheet, under the thumb, with the destructive
                Write off above it, still outlined red — and Tab walks them in
                the order they are seen. */}
            {isBlocked && canWriteOff && onStartWriteOff && (
              <UbButton variant="destructive" onClick={onStartWriteOff}>
                {t('parties.writeOff.action', { amount: amountText })}
              </UbButton>
            )}
            {isBlocked && onRecordPayment && (
              <UbButton variant="primary" onClick={onRecordPayment}>
                {t('parties.archive.recordPayment')}
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
          <UbStack gap={3} id={blockedBodyId} tabIndex={-1} className="outline-none">
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
              error.requestId
                ? formatRequestReference(t('common.error.reference'), error.requestId)
                : undefined
            }
          />
        )}
      </UbStack>
    </UbDialog>
  );
}

PartyArchiveDialogBase.displayName = 'PartyArchiveDialog';
export const PartyArchiveDialog = memo(PartyArchiveDialogBase);
