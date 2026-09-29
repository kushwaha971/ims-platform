'use client';

import { useCallback, useEffect, useId, useMemo, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbFieldError,
  UbForm,
  UbMoneyInput,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { RequestStatus } from 'src/types/api.types';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount } from 'src/utils/money';

import { usePaymentSchemas } from '../validation/paymentSchemas';
import { applyPrefill, applyTotals } from '../view-model/applyAdvance';

import type { ApplyFormValues, OpenDocument, Payment } from '../types/payment.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

/**
 * A4a (FRD 00 PLT-X03 §2, §7, §8) — Apply to bills.
 *
 * A receipt with money not yet applied — an advance taken before the bill existed — can be
 * applied to the party's open bills later. The dialog lists them oldest first, PRE-FILLED oldest
 * first up to what is left, and every row stays editable; the footer says what is being applied
 * and what stays as advance ("Applying ₹1,770 · ₹1,230 stays as advance"). The server is the
 * judge: a bill paid on another counter since, or an advance applied elsewhere, comes back as the
 * server's words above the Save button (`errors`).
 *
 * No khata line moves when it saves — the money was on the khata already — so nothing on the
 * khata changes; the bills it settles do. Loaded with `dynamic()` from the receipt page, because
 * a receipt is read far more often than it is applied.
 */
export function ApplyAdvanceDialog({
  payment,
  documents,
  status,
  busy,
  errors,
  onLoad,
  onClose,
  onConfirm,
  returnFocusRef,
}: Readonly<{
  payment: Payment;
  documents: readonly OpenDocument[];
  status: RequestStatus;
  busy: boolean;
  errors: readonly string[];
  onLoad: () => void;
  onClose: () => void;
  onConfirm: (rows: ApplyFormValues['rows']) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { applySchemaFor } = usePaymentSchemas();
  const formId = useId();
  const schema = useMemo(
    () => applySchemaFor(payment.unallocatedAmount),
    [applySchemaFor, payment.unallocatedAmount]
  );
  const form = useForm<ApplyFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { rows: [] },
  });

  useEffect(() => {
    onLoad();
  }, [onLoad]);

  const { reset } = form;
  useEffect(() => {
    if (status === 'succeeded') reset({ rows: applyPrefill(documents, payment.unallocatedAmount) });
  }, [status, documents, payment.unallocatedAmount, reset]);

  const rows = useWatch({ control: form.control, name: 'rows' }) ?? [];
  const totals = applyTotals(rows, payment.unallocatedAmount);
  const listError =
    form.formState.errors.rows?.message ?? form.formState.errors.rows?.root?.message;

  const handleSubmit = useCallback(
    (values: ApplyFormValues) => onConfirm(values.rows),
    [onConfirm]
  );

  const loading = status === 'idle' || status === 'loading';
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('payments.apply.title', { number: payment.number })}
      description={t('payments.apply.desc', {
        amount: formatAmount(payment.unallocatedAmount),
      })}
      closeLabel={t('common.action.close')}
      returnFocusRef={returnFocusRef}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={busy}
            busyLabel={t('payments.apply.working')}
            disabled={loading || documents.length === 0}
            data-testid="payment-apply-confirm"
          >
            {t('payments.apply.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={errors}>
        {loading && <UbSkeleton variant="list" count={2} label={t('payments.alloc.loading')} />}
        {status === 'failed' && (
          <UbText variant="body-sm" tone="formError" role="alert">
            {t('payments.alloc.error')}
          </UbText>
        )}
        {status === 'succeeded' && documents.length === 0 && (
          <UbText variant="body-sm" tone="tertiary" data-testid="apply-none">
            {t('payments.apply.noBills')}
          </UbText>
        )}
        {status === 'succeeded' && documents.length > 0 && (
          <UbStack gap={3} data-testid="apply-rows">
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
                  <UbField
                    name={`rows.${index}.amount`}
                    label={t('payments.alloc.rowLabel', { number: doc.number })}
                    labelHidden
                    placeholder="0.00"
                    hint={t('payments.alloc.max', { amount: formatAmount(doc.amountDue) })}
                    className="w-32 shrink-0"
                  >
                    {(field) => (
                      <UbMoneyInput
                        {...field}
                        value={field.value as string}
                        onChange={field.onChange}
                        inputMode="decimal"
                        disabled={busy}
                      />
                    )}
                  </UbField>
                </UbStack>
              ))}
            </UbStack>
            {listError && <UbFieldError id="apply-error">{listError}</UbFieldError>}
            <UbText variant="caption" tone="secondary" data-testid="apply-footer">
              {t('payments.apply.footer', {
                applying: formatAmount(totals.applying),
                remaining: formatAmount(
                  totals.remaining.startsWith('-') ? '0.00' : totals.remaining
                ),
              })}
            </UbText>
          </UbStack>
        )}
      </UbForm>
    </UbDialog>
  );
}
