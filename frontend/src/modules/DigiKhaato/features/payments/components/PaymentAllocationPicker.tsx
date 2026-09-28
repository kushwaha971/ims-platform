'use client';

import { useMemo } from 'react';

import { useWatch, type UseFormReturn } from 'react-hook-form';

import {
  UbAmount,
  UbField,
  UbFieldError,
  UbMoneyInput,
  UbSkeleton,
  UbStack,
  UbSwitch,
  UbText,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import type { RequestStatus } from 'src/types/api.types';
import { formatBusinessDate } from 'src/utils/dates';
import { compareMoney, formatAmount, subtractMoney } from 'src/utils/money';

import { fifoPreview, linesTotal, manualTotals } from '../view-model/paymentDisplay';

import type { OpenDocument, PaymentFormValues } from '../types/payment.types';

/**
 * PAY-01 FR-2 / FR-5 / FR-6 — which bills this money settles.
 *
 * "Auto — oldest first" is on by default and shows, per bill, what the server
 * WILL allocate (a client preview of FR-5's FIFO — the server decides on Save,
 * under the lock). Turning it off makes each row editable, capped at the bill's
 * due ("Max ₹898"), and the footer keeps "Allocated ₹… · ₹… kept as advance"
 * live, so a merchant sees an advance before they create one.
 *
 * One layout at every width: a row is the bill's number and date on the left,
 * its due or its input on the right — which fits a 360 px phone as a card and
 * reads as a table row on a laptop without a second rendering to keep in step.
 */
export function PaymentAllocationPicker({
  form,
  documents,
  status,
  t,
  disabled,
}: Readonly<{
  form: UseFormReturn<PaymentFormValues>;
  documents: readonly OpenDocument[];
  status: RequestStatus;
  t: TranslateFn;
  disabled?: boolean;
}>): React.JSX.Element | null {
  const auto = useWatch({ control: form.control, name: 'autoAllocate' });
  const lines = useWatch({ control: form.control, name: 'lines' }) ?? [];
  const rows = useWatch({ control: form.control, name: 'allocations' }) ?? [];
  const total = linesTotal(lines);
  const preview = useMemo(() => fifoPreview(total, documents), [total, documents]);
  const manual = manualTotals(total, rows);
  const advance = auto ? preview.advance : manual.advance;
  const allocated = auto ? subtractMoney(total, preview.advance) : manual.allocated;
  const overAllocated = !auto && compareMoney(manual.advance, '0.00') < 0;
  const listError = form.formState.errors.allocations?.message;

  if (status === 'loading' || status === 'idle') {
    return <UbSkeleton variant="list" count={2} label={t('payments.alloc.loading')} />;
  }

  if (documents.length === 0) {
    return (
      <UbText variant="caption" tone="tertiary" data-testid="alloc-none">
        {t('payments.alloc.none')}
      </UbText>
    );
  }

  return (
    <UbStack gap={3} data-testid="alloc-picker">
      <UbSwitch
        checked={auto}
        onCheckedChange={(next) => form.setValue('autoAllocate', next, { shouldDirty: true })}
        label={t('payments.alloc.auto')}
        description={t('payments.alloc.autoHint')}
        disabled={disabled}
      />
      <UbStack
        as="ul"
        gap={0}
        className="divide-y divide-border-hairline rounded-card border border-border-hairline"
      >
        {documents.map((doc, index) => (
          <UbStack
            as="li"
            key={doc.documentId}
            direction="row"
            justify="between"
            align="center"
            className="gap-3 px-3 py-2"
          >
            <UbStack gap={0} className="min-w-0">
              <UbText variant="body-sm" className="ds-mono truncate">
                {doc.number}
              </UbText>
              <UbText variant="caption" tone="tertiary">
                {t('payments.alloc.rowMeta', {
                  date: formatBusinessDate(doc.documentDate),
                  amount: formatAmount(doc.amountDue),
                })}
              </UbText>
            </UbStack>
            {auto ? (
              <UbAmount value={preview.allocations[doc.documentId] ?? '0.00'} size="sm" />
            ) : (
              <UbField
                name={`allocations.${index}.amount`}
                label={t('payments.alloc.rowLabel', { number: doc.number })}
                labelHidden
                placeholder="0.00"
                className="w-32 shrink-0"
              >
                {(field) => (
                  <UbMoneyInput
                    {...field}
                    value={field.value as string}
                    inputMode="decimal"
                    disabled={disabled}
                  />
                )}
              </UbField>
            )}
          </UbStack>
        ))}
      </UbStack>
      {listError && <UbFieldError id="alloc-error">{listError}</UbFieldError>}
      <UbStack direction="row" justify="between" className="flex-wrap gap-2">
        <UbText variant="caption" tone="secondary">
          {t('payments.alloc.allocated', {
            amount: formatAmount(allocated),
          })}
        </UbText>
        {overAllocated ? (
          <UbText variant="caption" tone="formError" role="alert">
            {t('payments.alloc.exceeds')}
          </UbText>
        ) : (
          compareMoney(advance, '0.00') > 0 && (
            <UbText variant="caption" tone="warning" data-testid="alloc-advance">
              {t('payments.alloc.unallocated', { amount: formatAmount(advance) })}
            </UbText>
          )
        )}
      </UbStack>
    </UbStack>
  );
}
