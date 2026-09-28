'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';

import {
  UbAmount,
  UbButton,
  UbField,
  UbMoneyInput,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { formatAmount } from 'src/utils/money';

import { PaymentMethodField } from '../../ledger/components/PaymentMethodField';
import { MAX_MODE_LINES } from '../constants/paymentConstants';
import {
  hasDuplicateModes,
  linesTotal,
  mergeDuplicateModes,
  remainingFor,
} from '../view-model/paymentDisplay';

import type { PaymentFormValues } from '../types/payment.types';

/** A reference placeholder by mode (PAY-02 §7): what the merchant would copy in. */
const REFERENCE_PLACEHOLDER: Readonly<Partial<Record<PaymentMode, string>>> = {
  upi: 'payments.reference.upi',
  bank: 'payments.reference.bank',
  cheque: 'payments.reference.cheque',
  card: 'payments.reference.card',
  other: 'payments.reference.other',
};

/**
 * PAY-02 — one payment, one or more ways it arrived: ₹700 PhonePe + ₹300 cash
 * is ONE receipt. Each line reuses the ledger's flattened chips
 * (`PaymentMethodField`: Cash · PhonePe · Google Pay · Paytm · Other UPI · …),
 * an amount, and a reference for every mode but cash. The total is the sum of
 * the lines and is never typed (US-PAY-02-3); "Fill remaining" puts the rest
 * of the bill on a line in one tap, and two lines of one mode offer to merge
 * (FR-4) rather than being refused at Save.
 */
export function PaymentModeEditor({
  form,
  target,
  t,
  disabled,
}: Readonly<{
  form: UseFormReturn<PaymentFormValues>;
  /** What the lines are meant to add up to — the bill's due or the receivable. */
  target: string;
  t: TranslateFn;
  disabled?: boolean;
}>): React.JSX.Element {
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'lines',
    keyName: 'key',
  });
  const lines = useWatch({ control: form.control, name: 'lines' }) ?? [];
  const total = linesTotal(lines);
  const duplicate = hasDuplicateModes(lines);
  const unused = PAYMENT_MODES.find((mode) => !lines.some((line) => line.mode === mode));

  const addLine = () => {
    const rest = remainingFor([...lines, { amount: '' }], lines.length, target);
    append({ mode: unused ?? 'cash', upiApp: '', amount: rest ?? '', reference: '' });
  };

  return (
    <UbStack gap={3} className="rounded-card border border-border-hairline bg-surface-sunken p-3">
      {fields.map((item, index) => {
        const line = lines[index];
        const rest = remainingFor(lines, index, target);
        const placeholder = line?.mode ? REFERENCE_PLACEHOLDER[line.mode] : undefined;
        return (
          <UbStack key={item.key} gap={2} data-testid={`payment-line-${index}`}>
            <UbField name={`lines.${index}.mode`} label={t('payments.mode.label')} labelHidden>
              {(field) => (
                <PaymentMethodField
                  id={field.id}
                  t={t}
                  ariaLabel={t('payments.mode.label')}
                  mode={field.value as PaymentMode | ''}
                  app={line?.upiApp ?? ''}
                  invalid={field.invalid}
                  describedBy={field['aria-describedby']}
                  onBlur={field.onBlur}
                  disabled={disabled}
                  onChange={(mode, app) => {
                    field.onChange(mode);
                    form.setValue(`lines.${index}.upiApp`, app, { shouldDirty: true });
                  }}
                />
              )}
            </UbField>
            <UbStack direction="row" gap={2} align="start">
              <UbField
                name={`lines.${index}.amount`}
                label={t('payments.mode.amount')}
                labelHidden
                placeholder={t('payments.amount.placeholder')}
                className="min-w-0 flex-1"
              >
                {(field) => (
                  <UbMoneyInput
                    {...field}
                    value={field.value as string}
                    inputMode="decimal"
                    disabled={disabled}
                    autoFocus={index === 0}
                  />
                )}
              </UbField>
              {fields.length > 1 && (
                <UbButton
                  variant="ghost"
                  iconOnly
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  onClick={() => remove(index)}
                  disabled={disabled}
                >
                  {t('payments.mode.remove')}
                </UbButton>
              )}
            </UbStack>
            {line?.mode && line.mode !== 'cash' && (
              <UbField
                name={`lines.${index}.reference`}
                label={t('payments.reference.label')}
                labelHidden
                placeholder={t(placeholder ?? 'payments.reference.other')}
              >
                {(field) => (
                  <UbTextInput
                    {...field}
                    value={field.value as string}
                    autoComplete="off"
                    maxLength={64}
                    className="ds-mono"
                    disabled={disabled}
                  />
                )}
              </UbField>
            )}
            {rest && fields.length > 1 && (
              <UbStack direction="row">
                <UbButton
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    form.setValue(`lines.${index}.amount`, rest, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  {t('payments.mode.fillRemaining', { amount: formatAmount(rest) })}
                </UbButton>
              </UbStack>
            )}
          </UbStack>
        );
      })}

      {duplicate && (
        <UbStatusBanner
          tone="info"
          title={t('payments.mode.duplicate')}
          action={
            <UbButton
              size="sm"
              variant="secondary"
              onClick={() => replace(mergeDuplicateModes(lines))}
            >
              {t('payments.mode.combine')}
            </UbButton>
          }
        />
      )}

      <UbStack direction="row" justify="between" align="center" className="gap-2">
        {fields.length < MAX_MODE_LINES ? (
          <UbButton
            variant="secondary"
            size="sm"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={addLine}
            disabled={disabled}
          >
            {t('payments.mode.add')}
          </UbButton>
        ) : (
          <UbText variant="caption" tone="tertiary">
            {t('payments.mode.maxLines', { count: MAX_MODE_LINES })}
          </UbText>
        )}
        <UbStack direction="row" align="center" className="gap-2">
          <UbText variant="body-sm" tone="secondary">
            {t('payments.mode.total')}
          </UbText>
          <UbAmount value={total} size="sm" />
        </UbStack>
      </UbStack>
    </UbStack>
  );
}
