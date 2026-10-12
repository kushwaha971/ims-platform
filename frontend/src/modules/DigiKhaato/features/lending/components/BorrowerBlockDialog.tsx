'use client';

import { useId, useState, type RefObject } from 'react';

import {
  UbButton,
  UbConfirmDialog,
  UbDialog,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { blockLendingBorrower, unblockLendingBorrower } from '../redux/lendingThunk';

import type { BorrowerRow } from '../types/lending.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/lending';

/** The server's column (`REASON_MAX`). */
const REASON_MAX = 160;

/**
 * Block or unblock a borrower (owner, 12 Oct 2026; owner or admin only).
 *
 * Block says its consequence in one plain sentence — "No new loans can be
 * given to Geeta Devi. Collections on running loans continue." — because the
 * second half is the thing a lender worries about: blocking somebody who owes
 * money must not look like letting the money go. The reason is optional; the
 * owner usually knows it, and when they write it down it is shown on the
 * borrower's page to whoever opens it next.
 *
 * Block is `UbConfirmDialog`'s rules (the act named on the button, the
 * consequence as the body, no dismissal on a stray backdrop tap) on `UbDialog`
 * itself, because the confirm has no room for the reason field. Unblock is the
 * confirm as it stands: it takes nothing away, so it is not destructive.
 *
 * Refusals reach the global snackbar from the service (they have no field to
 * sit on); this dialog stays open so the owner can try again.
 */
export function BorrowerBlockDialog({
  borrower,
  mode,
  onClose,
  returnFocusRef,
}: Readonly<{
  borrower: BorrowerRow;
  mode: 'block' | 'unblock';
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const name = borrower.name;

  const confirm = async () => {
    setBusy(true);
    const result =
      mode === 'block'
        ? await dispatch(blockLendingBorrower({ id: borrower.id, reason }))
        : await dispatch(unblockLendingBorrower(borrower.id));
    setBusy(false);
    const done =
      mode === 'block'
        ? blockLendingBorrower.fulfilled.match(result)
        : unblockLendingBorrower.fulfilled.match(result);
    if (!done) return;
    dispatch(
      showSnackbar({
        severity: 'success',
        id: mode === 'block' ? 'lending.borrower.block.done' : 'lending.borrower.unblock.done',
        params: { name },
      })
    );
    onClose();
  };

  if (mode === 'unblock') {
    return (
      <UbConfirmDialog
        open
        onOpenChange={(next) => !next && onClose()}
        title={t('lending.borrower.unblock.title', { name })}
        description={t('lending.borrower.unblock.body', { name })}
        confirmLabel={t('lending.borrower.unblock.action')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={() => void confirm()}
        busy={busy}
        busyLabel={t('lending.end.working')}
        destructive={false}
        returnFocusRef={returnFocusRef}
      />
    );
  }

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('lending.borrower.block.title', { name })}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            variant="destructive"
            busy={busy}
            busyLabel={t('lending.end.working')}
            onClick={() => void confirm()}
            data-testid="lending-borrower-block-confirm"
          >
            {t('lending.borrower.block.action')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" data-testid="lending-borrower-block-body">
          {t('lending.borrower.block.body', { name })}
        </UbText>
        <UbStack gap={1}>
          <UbText as="label" htmlFor={reasonId} variant="label">
            {t('lending.borrower.block.reason')}{' '}
            <UbText as="span" variant="caption" tone="tertiary">
              {t('common.field.optional')}
            </UbText>
          </UbText>
          <UbTextInput
            id={reasonId}
            placeholder={t('lending.end.reasonPlaceholder')}
            value={reason}
            onChange={setReason}
            maxLength={REASON_MAX}
            disabled={busy}
          />
        </UbStack>
      </UbStack>
    </UbDialog>
  );
}
