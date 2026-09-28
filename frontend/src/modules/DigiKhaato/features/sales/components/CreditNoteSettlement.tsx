'use client';

import { useMemo } from 'react';

import { type UseFormReturn } from 'react-hook-form';

import {
  UbDateInput,
  UbField,
  UbGrid,
  UbPanel,
  UbRadioGroup,
  UbSelect,
  UbStack,
  UbSwitch,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { PAYMENT_MODES } from 'src/types/domain.types';
import { formatInr } from 'src/utils/money';

import { CREDIT_NOTE_REASONS, type Settlement } from '../types/salesFlows.types';

import type { SalesDocument } from '../types/sales.types';
import type { CreditNoteFormValues } from '../validation/salesFlowSchemas';

/**
 * SAL-04 §7 — the rest of the return: the date (on or after the bill's, not in
 * the future), the reason (FR-12), restock (FR-5 — shown only when the bill
 * has item lines; services never move stock), and what happens to the credit
 * the bill does not absorb (FR-7): held as an advance, or refunded now. The
 * refund choice appears only when there IS something left to refund.
 */
export function CreditNoteSettlement({
  form,
  invoice,
  today,
  left,
  disabled,
}: Readonly<{
  form: UseFormReturn<CreditNoteFormValues>;
  invoice: SalesDocument;
  today: string;
  left: string;
  disabled: boolean;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { watch, setValue } = form;
  const settlement = watch('settlement');
  const restock = watch('restock');
  const hasGoods = invoice.lines.some((line) => !!line.itemId);
  const canRefund = Number(left) > 0;

  const reasons = useMemo(
    () =>
      CREDIT_NOTE_REASONS.map((value) => ({ value, label: t(`sales.creditNote.reason.${value}`) })),
    [t]
  );
  const modes = useMemo(
    () => PAYMENT_MODES.map((value) => ({ value, label: t(`ledger.mode.${value}`) })),
    [t]
  );
  const settlements = useMemo(
    () => [
      {
        value: 'hold_advance' as Settlement,
        label: t('sales.creditNote.settlement.hold'),
        description: t('sales.creditNote.settlement.holdHint'),
      },
      {
        value: 'refund' as Settlement,
        label: t('sales.creditNote.settlement.refund'),
        description: t('sales.creditNote.settlement.refundHint', { amount: formatInr(left) }),
      },
    ],
    [t, left]
  );

  return (
    <UbPanel>
      <UbStack gap={3} className="p-4">
        <UbGrid columns={{ base: 1, sm: 2 }} gap={3}>
          <UbField name="documentDate" label={t('sales.editor.date')}>
            {(field) => (
              <UbDateInput
                id={field.id}
                value={field.value as string}
                onChange={(next) => field.onChange(next ?? today)}
                min={invoice.documentDate}
                max={today}
                disabled={disabled}
              />
            )}
          </UbField>
          <UbField
            name="reason"
            label={t('sales.creditNote.reasonLabel')}
            placeholder={t('sales.creditNote.reasonPlaceholder')}
            required
          >
            {(field) => (
              <UbSelect
                id={field.id}
                value={(field.value as string) || null}
                onChange={field.onChange}
                onBlur={field.onBlur}
                options={reasons}
                placeholder={field.placeholder}
                aria-label={t('sales.creditNote.reasonLabel')}
                invalid={field.invalid}
                disabled={disabled}
              />
            )}
          </UbField>
        </UbGrid>
        <UbField
          name="reasonNote"
          label={t('sales.creditNote.reasonNote')}
          placeholder={t('sales.creditNote.reasonNotePlaceholder')}
          optionalLabel={t('common.field.optional')}
        >
          {(field) => <UbTextInput {...field} maxLength={160} disabled={disabled} />}
        </UbField>
        {hasGoods && (
          <UbSwitch
            checked={restock}
            onCheckedChange={(checked) => setValue('restock', checked, { shouldDirty: true })}
            label={t('sales.creditNote.restock')}
            description={t(restock ? 'sales.creditNote.restockOn' : 'sales.creditNote.restockOff')}
            disabled={disabled}
          />
        )}
        {canRefund ? (
          <UbRadioGroup<Settlement>
            name="credit-note-settlement"
            value={settlement}
            onChange={(next) => setValue('settlement', next, { shouldDirty: true })}
            options={settlements}
            ariaLabel={t('sales.creditNote.settlement.label')}
          />
        ) : (
          <UbText variant="caption" tone="tertiary">
            {t('sales.creditNote.settlement.allApplied')}
          </UbText>
        )}
        {canRefund && settlement === 'refund' && (
          <UbGrid columns={{ base: 1, sm: 2 }} gap={3}>
            <UbField name="refundMode" label={t('sales.payment.mode')}>
              {(field) => (
                <UbSelect
                  id={field.id}
                  value={(field.value as string) || null}
                  onChange={field.onChange}
                  options={modes}
                  aria-label={t('sales.payment.mode')}
                  disabled={disabled}
                />
              )}
            </UbField>
            <UbField
              name="refundReference"
              label={t('sales.payment.reference')}
              placeholder={t('sales.payment.referencePlaceholder')}
            >
              {(field) => <UbTextInput {...field} maxLength={64} disabled={disabled} />}
            </UbField>
          </UbGrid>
        )}
      </UbStack>
    </UbPanel>
  );
}
