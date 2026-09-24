'use client';

import { CheckCircle2 } from 'lucide-react';

import { UbButton, UbDialog, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import type { SalesDocumentEnvelope } from '../types/sales.types';

/**
 * SAL-02 §8 — the success sheet, the only modal after issue: the number, the
 * ledger effect ("₹1,772 added to Ramesh's khata", in the receivable tone) or
 * the payment ("Paid ₹1,772 · Cash"), and Print / View / New bill.
 */
export function InvoiceIssuedDialog({
  issued,
  onPrint,
  onView,
  onNewBill,
}: Readonly<{
  issued: SalesDocumentEnvelope;
  onPrint: () => void;
  onView: () => void;
  onNewBill: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const doc = issued.document;
  const party = doc.party?.name;
  const modes = doc.payment?.modeBreakup.map((row) => t(`ledger.mode.${row.mode}`)).join(' + ');

  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onView()}
      title={t('sales.issued.title', { number: doc.number ?? '' })}
      closeLabel={t('common.action.close')}
      icon={<CheckCircle2 className="h-5 w-5 text-success" aria-hidden />}
      footer={
        <>
          <UbButton variant="secondary" onClick={onNewBill} data-testid="invoice-new-after-issue">
            {t('sales.newBill')}
          </UbButton>
          <UbButton variant="secondary" onClick={onView}>
            {t('sales.issued.view')}
          </UbButton>
          <UbButton onClick={onPrint} data-testid="invoice-print-after-issue">
            {t('sales.print.action')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={2}>
        {party && doc.amountDue !== '0.00' ? (
          <UbText tone="error">
            {t('sales.issued.addedToKhata', { amount: formatInr(doc.amountDue), party })}
          </UbText>
        ) : (
          <UbText tone="success">
            {t('sales.issued.paid', { amount: formatInr(doc.amountPaid), modes: modes ?? '' })}
          </UbText>
        )}
        {issued.warnings.map((warning) => (
          <UbText key={warning.code} variant="caption" tone="warning">
            {warning.message}
          </UbText>
        ))}
      </UbStack>
    </UbDialog>
  );
}
