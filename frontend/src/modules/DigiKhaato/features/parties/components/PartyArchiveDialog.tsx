'use client';

import { memo, useCallback, useState } from 'react';

import {
  UbAmount,
  UbButton,
  UbDialog,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

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
 * ── No Write-off button ────────────────────────────────────────────────────
 * The escape from the balance guard is a `write_off` ledger entry, and there is
 * no `ledger_entry` table. A button that opens a form that cannot post is worse
 * than no button: it teaches a merchant that the way out exists and then fails
 * at the last step, having taken a reason and an acknowledgement off them.
 */
export interface PartyArchiveDialogProps {
  readonly t: TranslateFn;
  readonly name: string;
  readonly stage: ArchiveStage;
  readonly blocked: BlockedBalance | null;
  readonly error: ApiErrorShape | null;
  readonly onConfirm: (reason: string) => void;
  readonly onClose: () => void;
}

function PartyArchiveDialogBase({
  t,
  name,
  stage,
  blocked,
  error,
  onConfirm,
  onClose,
}: Readonly<PartyArchiveDialogProps>) {
  const [reason, setReason] = useState('');
  const saving = stage === 'saving';

  const handleConfirm = useCallback(() => onConfirm(reason.trim()), [onConfirm, reason]);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving) onClose();
    },
    [onClose, saving]
  );

  if (stage === 'closed') return null;

  const isBlocked = stage === 'blocked' && blocked !== null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={
        isBlocked
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
        <>
          {/* Cancel first and Cancel focused. The destructive action requires a
              deliberate move to reach, so a merchant holding Enter cannot
              archive anybody by accident. */}
          <UbButton variant="secondary" onClick={onClose} disabled={saving} autoFocus>
            {t('common.action.cancel')}
          </UbButton>
          {!isBlocked && (
            /* Outlined danger, never a filled red block: a destructive action
               should be reachable and unmistakable, not shouted. */
            <UbButton variant="destructive" onClick={handleConfirm} busy={saving} busyLabel={t('parties.archive.saving')}>
              {t('parties.archive.action')}
            </UbButton>
          )}
        </>
      }
    >
      <UbStack gap={4}>
        {isBlocked ? (
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
            {/* FR-10's three actions are Record payment, Write off and Cancel.
                The first needs LED-01's entry drawer and the second needs a
                `ledger_entry` table; neither exists, so the dialog explains and
                offers the way out it has. The merchant settles the balance in
                the ledger once there is one. */}
            <UbText variant="caption" tone="tertiary">
              {t('parties.archive.blocked.soon')}
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
            description={error.requestId ? `${t('common.error.reference')} ${error.requestId}` : undefined}
          />
        )}
      </UbStack>
    </UbDialog>
  );
}

PartyArchiveDialogBase.displayName = 'PartyArchiveDialog';
export const PartyArchiveDialog = memo(PartyArchiveDialogBase);
