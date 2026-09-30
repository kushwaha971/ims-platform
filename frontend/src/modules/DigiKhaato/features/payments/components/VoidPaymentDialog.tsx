'use client';

import { useCallback, useId, type RefObject } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDialog,
  UbField,
  UbForm,
  UbStack,
  UbTag,
  UbText,
  UbTextInput,
  UbPressable,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatAmount } from 'src/utils/money';

import { VOID_REASON_IDS } from '../constants/paymentConstants';
import { usePaymentSchemas } from '../validation/paymentSchemas';
import { voidConsequences } from '../view-model/paymentDisplay';

import type { Payment } from '../types/payment.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/validation';

/**
 * PAY-05 FR-2 — "Void RCT/26-27/0017?", with a reason, quick-reason chips, and
 * what will change said BEFORE it happens: the khata line reversed today, each
 * bill reopened with its due, the advance dropped. Computed from the held
 * receipt; the server's answer is what the page then shows.
 *
 * Loaded with the receipt page's own chunk only when opened (`dynamic()`),
 * because a receipt is read far more often than it is voided.
 */
export function VoidPaymentDialog({
  payment,
  busy,
  errors,
  onClose,
  onConfirm,
  returnFocusRef,
}: Readonly<{
  payment: Payment;
  busy: boolean;
  errors: readonly string[];
  onClose: () => void;
  onConfirm: (reason: string) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { voidReasonSchema } = usePaymentSchemas();
  const formId = useId();
  const form = useForm<{ reason: string }>({
    resolver: yupResolver(voidReasonSchema),
    mode: 'onTouched',
    defaultValues: { reason: '' },
  });

  const handleSubmit = useCallback(
    (values: { reason: string }) => onConfirm(values.reason),
    [onConfirm]
  );

  const consequences = voidConsequences(payment).map((row) => {
    switch (row.kind) {
      case 'ledger':
        return t(
          payment.direction === 'in'
            ? 'payments.void.consequence.ledgerIn'
            : 'payments.void.consequence.ledgerOut',
          { name: payment.party?.name ?? '', amount: formatAmount(row.amount) }
        );
      case 'document':
        return t('payments.void.consequence.document', {
          number: row.number ?? '',
          amount: formatAmount(row.amount),
        });
      case 'advance':
        return t('payments.void.consequence.advance', { amount: formatAmount(row.amount) });
      case 'depositBack':
        return t('payments.void.consequence.depositBack', { amount: formatAmount(row.amount) });
      case 'depositGone':
        return t('payments.void.consequence.depositGone', { amount: formatAmount(row.amount) });
      case 'depositPair':
        return t('payments.void.consequence.depositPair', {
          number: row.number ?? '',
          amount: formatAmount(row.amount),
        });
      default:
        return t('payments.void.walkInWarning');
    }
  });

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('payments.void.title', { number: payment.number })}
      description={t('payments.void.desc')}
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
            variant="destructive"
            busy={busy}
            busyLabel={t('payments.void.working')}
            data-testid="payment-void-confirm"
          >
            {t('payments.void.confirm')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={handleSubmit} formErrors={errors}>
        <UbStack as="ul" gap={1} aria-label={t('payments.void.consequences')}>
          {consequences.map((line) => (
            <UbStack as="li" key={line}>
              {/* Wraps: a consequence is a sentence whose END is the amount. As a
                  truncating list-item title it read "This also reverses the
                  matching adjustment RCT/26-27/0003 (…" at 390 px (Wave A gate). */}
              <UbText variant="body-sm" className="break-words">
                {line}
              </UbText>
            </UbStack>
          ))}
        </UbStack>
        <UbStack direction="row" className="flex-wrap gap-2">
          {VOID_REASON_IDS.map((id) => (
            <UbPressable
              key={id}
              onClick={() =>
                form.setValue('reason', t(id), { shouldDirty: true, shouldValidate: true })
              }
            >
              <UbTag name={t(id)} />
            </UbPressable>
          ))}
        </UbStack>
        <UbField
          name="reason"
          label={t('payments.void.reason')}
          placeholder={t('payments.void.reason.placeholder')}
          required
        >
          {(field) => <UbTextInput {...field} maxLength={160} autoComplete="off" />}
        </UbField>
        <UbText variant="caption" tone="tertiary">
          {t('payments.void.receiptNote')}
        </UbText>
      </UbForm>
    </UbDialog>
  );
}
