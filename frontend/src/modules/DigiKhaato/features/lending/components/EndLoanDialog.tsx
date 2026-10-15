'use client';

import { useId, useState } from 'react';

import { CompactDialog } from 'src/components/records/CompactOverlays';
import {
  UbButton,
  UbCheckbox,
  UbCombobox,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { formatInr } from 'src/utils/money';

import { endLendingLoan } from '../redux/lendingThunk';

import type { LoanDetail } from '../types/lending.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/lending';

const REASONS = ['cannot_trace', 'death', 'bad_debt', 'other'] as const;

/**
 * LEN-10 — ending a loan that will not be repaid as agreed.
 *
 * * **Write off** (owner only): states the exact figure that leaves the borrower's
 *   account, asks for a reason and a tick that the owner understands, and sends that
 *   SAME figure — if a collection moved it meanwhile, the server refuses and the new
 *   figure is shown (the khata write-off's pattern). Nothing is deleted.
 * * **Cancel** (no money collected): the loan never happened in the books — the cash
 *   given and the file charge come off the borrower's account.
 *
 * Words are plain and never threatening (G-3, G-4): no "defaulter", no "legal action".
 */
export function EndLoanDialog({
  loan,
  mode,
  onClose,
}: Readonly<{
  loan: LoanDetail;
  mode: 'write_off' | 'cancel';
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const baseId = useId();
  const [reasonCode, setReasonCode] = useState<string>('');
  const [reason, setReason] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [amount, setAmount] = useState(loan.writeOffAmount ?? '0.00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const writeOff = mode === 'write_off';
  const valid = reason.trim().length >= 3 && (!writeOff || (!!reasonCode && understood));

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await dispatch(
      endLendingLoan({
        loanId: loan.id,
        body: writeOff
          ? { kind: 'write_off', amount, reasonCode, reason }
          : { kind: 'cancel', reason },
      })
    );
    setBusy(false);
    if (!endLendingLoan.fulfilled.match(result)) {
      const failed = result.payload ?? null;
      const balance = failed?.details?.balance;
      if (failed?.code === 'balance_changed' && typeof balance === 'string') {
        setAmount(balance);
        setUnderstood(false);
      }
      setError(failed);
      return;
    }
    dispatch(
      showSnackbar({
        severity: 'success',
        id: writeOff ? 'lending.end.writeOff.done' : 'lending.end.cancel.done',
        params: { number: loan.number, amount: formatInr(amount) },
      })
    );
    onClose();
  };

  return (
    <CompactDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(writeOff ? 'lending.end.writeOff.title' : 'lending.end.cancel.title', {
        number: loan.number,
      })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('lending.end.keep')}
          </UbButton>
          <UbButton
            variant="destructive"
            busy={busy}
            busyLabel={t('lending.end.working')}
            disabled={!valid}
            onClick={() => void submit()}
            data-testid="lending-end-confirm"
          >
            {t(writeOff ? 'lending.end.writeOff.action' : 'lending.end.cancel.action')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" data-testid="lending-end-body">
          {writeOff
            ? t('lending.end.writeOff.body', {
                amount: formatInr(amount),
                name: loan.borrower.name,
              })
            : t('lending.end.cancel.body', {
                amount: formatInr(loan.cashHandedOver),
                name: loan.borrower.name,
              })}
        </UbText>
        {error?.code === 'balance_changed' && (
          <UbStatusBanner tone="warning" title={t('lending.end.writeOff.changed')} />
        )}
        {error && error.code !== 'balance_changed' && (
          <UbStatusBanner tone="error" title={error.message} />
        )}
        {writeOff && (
          <UbCombobox
            searchPlaceholder={t('lending.select.search')}
            emptyLabel={t('lending.select.noMatches')}
            id={`${baseId}-code`}
            aria-label={t('lending.end.writeOff.reasonCode')}
            value={reasonCode}
            onChange={setReasonCode}
            placeholder={t('lending.end.writeOff.reasonCode')}
            options={REASONS.map((code) => ({
              value: code,
              label: t(`lending.end.writeOff.code.${code}`),
            }))}
          />
        )}
        <UbTextInput
          id={`${baseId}-reason`}
          aria-label={t('lending.end.reason')}
          placeholder={t('lending.end.reasonPlaceholder')}
          value={reason}
          onChange={setReason}
          maxLength={255}
        />
        {writeOff && (
          <UbCheckbox
            id={`${baseId}-understood`}
            checked={understood}
            onChange={setUnderstood}
            label={t('lending.end.writeOff.understood', { amount: formatInr(amount) })}
          />
        )}
      </UbStack>
    </CompactDialog>
  );
}
