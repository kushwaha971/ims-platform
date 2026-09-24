'use client';

import { useId, useMemo, useState } from 'react';

import { Plus, Trash2 } from 'lucide-react';

import { UbButton, UbDrawer, UbMoneyInput, UbStack, UbText, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { PaymentMode } from 'src/types/domain.types';
import { formatInr, sumMoney } from 'src/utils/money';

import { PaymentMethodField } from '../../ledger/components/PaymentMethodField';
import { fullCashPayment, type PaymentRowForm } from '../view-model/invoiceForm';

/**
 * SAL-07 FR-3 — the walk-in payment sheet: defaults to the full amount in
 * cash, lets the merchant split it (₹700 UPI + ₹300 cash), and cannot be
 * confirmed until the modes add up to the bill (§10: "Split amounts must add
 * up to ₹{amount}"). No "Full credit" — a walk-in is never a receivable.
 *
 * Recorded on the invoice itself until PAY-01's payments module exists; the
 * sheet is the seam, and its rows are exactly PAY-01's `mode_breakup`.
 */
export function InvoicePaymentDrawer({
  open,
  grandTotal,
  busy,
  onClose,
  onConfirm,
}: Readonly<{
  open: boolean;
  grandTotal: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (rows: readonly PaymentRowForm[]) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const baseId = useId();
  const [rows, setRows] = useState<PaymentRowForm[]>(() => fullCashPayment(grandTotal));
  const paid = useMemo(() => sumMoney(rows.map((r) => r.amount || '0')), [rows]);
  const balanced = paid === grandTotal;
  const needsReference = rows.some((r) => r.mode === 'cheque' && !r.reference.trim());

  const update = (index: number, patch: Partial<PaymentRowForm>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <UbDrawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('sales.payment.title')}
      description={t('sales.payment.walkInHint')}
      closeLabel={t('common.action.close')}
      footer={
        <UbButton
          fullWidth
          busy={busy}
          busyLabel={t('sales.editor.issuing')}
          disabled={!balanced || needsReference}
          onClick={() => onConfirm(rows)}
          data-testid="invoice-payment-confirm"
        >
          {t('sales.payment.confirm', { amount: formatInr(grandTotal) })}
        </UbButton>
      }
    >
      <UbStack gap={4}>
        {rows.map((row, index) => (
          <UbStack
            key={`${baseId}-${index}`}
            gap={2}
            className="rounded-card border border-border-hairline p-3"
          >
            <PaymentMethodField
              id={`${baseId}-mode-${index}`}
              mode={row.mode}
              app=""
              onChange={(mode: PaymentMode) => update(index, { mode })}
              t={t}
              ariaLabel={t('sales.payment.mode')}
            />
            <UbStack direction="row" gap={2} align="center">
              <UbMoneyInput
                id={`${baseId}-amount-${index}`}
                aria-label={t('sales.payment.amount')}
                value={row.amount}
                onChange={(amount) => update(index, { amount })}
                className="flex-1"
              />
              {rows.length > 1 && (
                <UbButton
                  variant="ghost"
                  iconOnly
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  {t('sales.payment.removeSplit')}
                </UbButton>
              )}
            </UbStack>
            {row.mode !== 'cash' && (
              <UbTextInput
                id={`${baseId}-ref-${index}`}
                aria-label={t('sales.payment.reference')}
                placeholder={t('sales.payment.referencePlaceholder')}
                value={row.reference}
                onChange={(reference) => update(index, { reference })}
                maxLength={64}
              />
            )}
          </UbStack>
        ))}
        <UbButton
          variant="secondary"
          icon={<Plus className="h-4 w-4" aria-hidden />}
          onClick={() =>
            setRows((current) => [...current, { mode: 'upi', amount: '', reference: '' }])
          }
        >
          {t('sales.payment.split')}
        </UbButton>
        {!balanced && (
          <UbText variant="body-sm" tone="formError" role="alert">
            {t('sales.payment.mustBalance', { amount: formatInr(grandTotal) })}
          </UbText>
        )}
      </UbStack>
    </UbDrawer>
  );
}
