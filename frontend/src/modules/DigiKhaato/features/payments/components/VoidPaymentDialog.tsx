'use client';

import { type RefObject } from 'react';

import { ReasonConfirmDialog } from 'src/components/records/ReasonConfirmDialog';
import { UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatAmount } from 'src/utils/money';

import { VOID_REASON_IDS } from '../constants/paymentConstants';
import { voidConsequences } from '../view-model/paymentDisplay';

import type { Payment } from '../types/payment.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/payments';

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
    <ReasonConfirmDialog
      title={t('payments.void.title', { number: payment.number })}
      description={t('payments.void.desc')}
      confirmLabel={t('payments.void.confirm')}
      workingLabel={t('payments.void.working')}
      reasonLabel={t('payments.void.reason')}
      reasonPlaceholder={t('payments.void.reason.placeholder')}
      requiredMessageId="payments.void.reason.required"
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
      formErrors={errors}
      suggestions={VOID_REASON_IDS.map((id) => t(id))}
      footnote={t('payments.void.receiptNote')}
      confirmTestId="payment-void-confirm"
      returnFocusRef={returnFocusRef}
    >
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
    </ReasonConfirmDialog>
  );
}
