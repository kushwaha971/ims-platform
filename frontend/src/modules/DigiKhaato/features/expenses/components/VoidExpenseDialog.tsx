'use client';

import { type RefObject } from 'react';

import { ReasonConfirmDialog } from 'src/components/records/ReasonConfirmDialog';
import { UbAmount, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

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
 *
 * The dialog is `ReasonConfirmDialog` (WP-03 D-04c).
 */
export function VoidExpenseDialog({
  form,
  returnFocusRef,
}: Readonly<{
  form: UseExpenseFormResult;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { voiding, isVoiding, voidErrors, closeVoid, submitVoid } = form;

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
    <ReasonConfirmDialog
      title={t('expenses.void.title', { number: voiding.number })}
      confirmLabel={t('expenses.void.confirm')}
      workingLabel={t('expenses.void.working')}
      reasonLabel={t('expenses.void.reason')}
      reasonPlaceholder={t('expenses.void.reason.placeholder')}
      requiredMessageId="expenses.void.reason.required"
      busy={isVoiding}
      onConfirm={submitVoid}
      onClose={closeVoid}
      formErrors={voidErrors}
      returnFocusRef={returnFocusRef}
    >
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
    </ReasonConfirmDialog>
  );
}
