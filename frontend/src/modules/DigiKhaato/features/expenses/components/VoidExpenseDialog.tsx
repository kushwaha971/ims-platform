'use client';

import { useCallback, useEffect, useId, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbAmount,
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

import { useExpenseSchemas } from '../validation/expenseSchemas';
import { expenseTitle } from '../view-model/expenseDisplay';

import type { UseExpenseFormResult } from '../hooks/useExpenseForm';

/**
 * EXP-01 FR-12 — "Void EXP/26-27/0031?", with a reason, and the consequence
 * said before it happens.
 *
 * The expense is restated inside the dialog for the reason LED-03's reverse
 * dialog gives: a merchant confirming "void ₹12,000 rent" is confirming
 * something; one confirming "void this" is confirming a button press. The
 * consequence line differs by kind — a paid expense leaves the cashbook, an
 * unpaid one also takes its line out of the party's khata — because those are
 * the two different things that will change.
 */
export function VoidExpenseDialog({
  form,
  returnFocusRef,
}: Readonly<{
  form: UseExpenseFormResult;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { voidReasonSchema } = useExpenseSchemas();
  const formId = useId();
  const { voiding, isVoiding, voidErrors, closeVoid, submitVoid } = form;

  const rhf = useForm<{ reason: string }>({
    resolver: yupResolver(voidReasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });
  const { reset } = rhf;

  useEffect(() => {
    reset({ reason: '' });
  }, [voiding?.id, reset]);

  const handleSubmit = useCallback(
    async (values: { reason: string }) => {
      await submitVoid(values.reason);
    },
    [submitVoid]
  );
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeVoid();
    },
    [closeVoid]
  );

  if (!voiding) return null;

  const consequence = voiding.paid
    ? t('expenses.void.consequence.paid', {
        amount: formatAmount(voiding.amount),
        date: formatBusinessDate(voiding.expenseDate),
      })
    : t('expenses.void.consequence.unpaid', {
        amount: formatAmount(voiding.amount),
        name: voiding.party?.name ?? '',
      });

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={t('expenses.void.title', { number: voiding.number })}
      closeLabel={t('common.action.close')}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <UbButton variant="secondary" onClick={closeVoid} disabled={isVoiding}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            variant="destructive"
            busy={isVoiding}
            busyLabel={t('expenses.void.working')}
          >
            {t('expenses.void.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={rhf} onSubmit={handleSubmit} formErrors={voidErrors}>
        <UbStack direction="row" justify="between" align="start" className="gap-3">
          <UbStack gap={1} className="min-w-0 flex-1">
            <UbText variant="body" className="line-clamp-2">
              {expenseTitle(voiding)}
            </UbText>
            <UbText variant="caption" tone="tertiary">
              {formatBusinessDate(voiding.expenseDate)}
            </UbText>
          </UbStack>
          <UbAmount value={voiding.amount} size="sm" />
        </UbStack>
        <UbText variant="caption" tone="tertiary">
          {consequence}
        </UbText>
        <UbField
          name="reason"
          label={t('expenses.void.reason')}
          placeholder={t('expenses.void.reason.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" autoFocus />}
        </UbField>
      </UbForm>
    </UbDialog>
  );
}
