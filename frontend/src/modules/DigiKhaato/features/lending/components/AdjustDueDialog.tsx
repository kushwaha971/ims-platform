'use client';

import { useEffect, useId, useState } from 'react';

import { CompactDialog } from 'src/components/records/CompactOverlays';
import {
  UbButton,
  UbChoiceChips,
  UbMoneyInput,
  UbSkeleton,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { compareMoney, formatInr } from 'src/utils/money';

import { adjustLendingDue, fetchLendingDue } from '../redux/lendingThunk';

import type { LoanDue, LoanDueFigures } from '../types/lending.types';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/lending';
import { hasReason } from 'src/utils/reason';

type Part = 'interest' | 'fee' | 'principal';
const PARTS: readonly Part[] = ['fee', 'interest', 'principal'];

const newKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random()}`;

/**
 * LEN-09 — one instalment's late fee or waiver.
 *
 * * **Late fee** (FR-3): prefilled with what the agreed rule allows by today ("late
 *   fee so far"), which the owner may lower and never raise — the server refuses
 *   more. Never automatic: nothing is charged until this is saved.
 * * **Waive** (FR-5): forgive all or part of the late fee, interest or principal
 *   still owed on the instalment, with a reason; each choice shows what is left.
 *
 * Both post through the dues engine, so the borrower's khata and the loan's figures
 * move together; the loan page re-reads itself from the reply.
 */
export function AdjustDueDialog({
  loanId,
  due,
  mode,
  onClose,
}: Readonly<{
  loanId: string;
  due: LoanDue;
  mode: 'fee' | 'waive';
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const baseId = useId();
  const [figures, setFigures] = useState<LoanDueFigures | null>(null);
  const [part, setPart] = useState<Part>('fee');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [key] = useState(newKey);

  useEffect(() => {
    const request = dispatch(fetchLendingDue({ loanId, dueId: due.id }));
    void request.then((result) => {
      if (!fetchLendingDue.fulfilled.match(result)) {
        if (!result.meta.aborted) setError(result.payload ?? null);
        return;
      }
      const data = result.payload;
      setFigures(data);
      if (mode === 'fee' && data.lateFee) {
        setAmount(data.lateFee.suggested);
        setReason(t('lending.adjust.fee.reasonDefault', { days: data.lateFee.daysLate }));
      } else if (mode === 'waive') {
        const first = PARTS.find((p) => compareMoney(data.waivable[p], '0.00') > 0) ?? 'fee';
        setPart(first);
        setAmount(data.waivable[first]);
      }
    });
    return () => request.abort();
  }, [dispatch, loanId, due.id, mode, t]);

  const ceiling = !figures
    ? '0.00'
    : mode === 'fee'
      ? (figures.lateFee?.suggested ?? '0.00')
      : figures.waivable[part];
  const valid =
    !!amount &&
    compareMoney(amount, '0.00') > 0 &&
    compareMoney(amount, ceiling) <= 0 &&
    hasReason(reason);
  const nothing = !!figures && compareMoney(ceiling, '0.00') <= 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await dispatch(
      adjustLendingDue({
        loanId,
        kind: mode,
        dueId: due.id,
        amount,
        reason,
        component: mode === 'waive' ? part : undefined,
        key,
      })
    );
    setBusy(false);
    if (!adjustLendingDue.fulfilled.match(result)) {
      setError(result.payload ?? null);
      return;
    }
    dispatch(
      showSnackbar({
        severity: 'success',
        id: mode === 'fee' ? 'lending.adjust.fee.done' : 'lending.adjust.waive.done',
        params: { amount: formatInr(amount), seq: due.seq },
      })
    );
    onClose();
  };

  return (
    <CompactDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(mode === 'fee' ? 'lending.adjust.fee.title' : 'lending.adjust.waive.title', {
        seq: due.seq,
      })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            busy={busy}
            busyLabel={t('lending.adjust.working')}
            disabled={!valid || nothing}
            onClick={() => void submit()}
            data-testid="lending-adjust-save"
          >
            {t(mode === 'fee' ? 'lending.adjust.fee.save' : 'lending.adjust.waive.save')}
          </UbButton>
        </>
      }
    >
      {!figures && !error && <UbSkeleton variant="card" />}
      {figures && (
        <UbStack gap={3}>
          {mode === 'fee' && figures.lateFee && (
            <UbText variant="body-sm" tone="secondary" data-testid="lending-adjust-so-far">
              {t('lending.adjust.fee.soFar', {
                amount: formatInr(figures.lateFee.ruleAmount),
                days: figures.lateFee.daysLate,
                charged: formatInr(figures.lateFee.alreadyCharged),
              })}
            </UbText>
          )}
          {mode === 'waive' && (
            <UbChoiceChips<Part>
              id={`${baseId}-part`}
              ariaLabel={t('lending.adjust.waive.part')}
              value={part}
              onChange={(next) => {
                setPart(next);
                setAmount(figures.waivable[next]);
              }}
              options={PARTS.map((p) => ({
                value: p,
                label: t(`lending.adjust.part.${p}`, { amount: formatInr(figures.waivable[p]) }),
              }))}
            />
          )}
          {nothing && (
            <UbStatusBanner
              tone="info"
              title={t(
                mode === 'fee' ? 'lending.adjust.fee.nothing' : 'lending.adjust.waive.nothing'
              )}
            />
          )}
          <UbMoneyInput
            id={`${baseId}-amount`}
            aria-label={t('lending.adjust.amount')}
            value={amount}
            onChange={setAmount}
            inputMode="decimal"
            invalid={!!amount && compareMoney(amount, ceiling) > 0}
          />
          <UbText variant="caption" tone="tertiary">
            {t('lending.adjust.atMost', { amount: formatInr(ceiling) })}
          </UbText>
          <UbTextInput
            id={`${baseId}-reason`}
            aria-label={t('lending.adjust.reason')}
            placeholder={t('lending.adjust.reasonPlaceholder')}
            value={reason}
            onChange={setReason}
            maxLength={255}
          />
        </UbStack>
      )}
      {error && <UbStatusBanner tone="error" title={error.message} />}
    </CompactDialog>
  );
}
