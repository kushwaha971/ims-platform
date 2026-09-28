'use client';

import { useId, useMemo, useState } from 'react';

import { Plus, Trash2 } from 'lucide-react';

import { UbButton, UbDrawer, UbMoneyInput, UbStack, UbText, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { PaymentMode } from 'src/types/domain.types';
import { compareMoney, formatInr, subtractMoney, sumMoney } from 'src/utils/money';

import { PaymentMethodField } from '../../ledger/components/PaymentMethodField';
import { fullCashPayment, type PaymentRowForm } from '../../sales/view-model/invoiceForm';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/ledger';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/purchases';

/**
 * PUR-01 FR-6h / US-3 — "Paid now", the record step's last question: did
 * money change hands with this bill? Defaults to the full amount in cash; the
 * merchant may split it (₹4,000 bank + ₹1,000 cash, PAY-02), pay part of it,
 * or more (the rest is an advance on the supplier's khata, PUR-02 US-4). "Pay
 * later" records the bill with nothing paid — the whole amount goes on the
 * khata as "You will give".
 *
 * The rows are PAY-01's `mode_breakup`; the server records them as a real
 * PAYOUT voucher allocated to this bill, in the record's transaction. The same
 * shape as the invoice editor's payment sheet (SAL-02 FR-10), in the
 * supplier's words, and it reuses that sheet's pure helpers and the ledger's
 * mode picker rather than a copy of either.
 */
export function PurchasePaidNowDrawer({
  grandTotal,
  busy,
  onClose,
  onConfirm,
  onPayLater,
}: Readonly<{
  grandTotal: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (rows: readonly PaymentRowForm[]) => void;
  onPayLater: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const baseId = useId();
  const [rows, setRows] = useState<PaymentRowForm[]>(() => fullCashPayment(grandTotal));
  const paid = useMemo(() => sumMoney(rows.map((r) => r.amount || '0')), [rows]);
  const nothing = compareMoney(paid, '0.00') <= 0;
  const advance = compareMoney(paid, grandTotal) > 0 ? subtractMoney(paid, grandTotal) : null;
  const needsReference = rows.some((r) => r.mode === 'cheque' && !r.reference.trim());

  const update = (index: number, patch: Partial<PaymentRowForm>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('purchases.payment.title')}
      description={t('purchases.payment.hint')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton
            variant="secondary"
            disabled={busy}
            onClick={onPayLater}
            data-testid="purchase-pay-later"
          >
            {t('purchases.payment.later')}
          </UbButton>
          <UbButton
            busy={busy}
            busyLabel={t('purchases.editor.recording')}
            disabled={nothing || needsReference}
            onClick={() => onConfirm(rows)}
            data-testid="purchase-paid-now-confirm"
          >
            {t('purchases.payment.confirm', { amount: formatInr(paid) })}
          </UbButton>
        </>
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
              ariaLabel={t('purchases.payment.mode')}
            />
            <UbStack direction="row" gap={2} align="center">
              <UbMoneyInput
                id={`${baseId}-amount-${index}`}
                aria-label={t('purchases.payment.amount')}
                placeholder={t('purchases.payment.amountPlaceholder')}
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
                  {t('purchases.payment.removeSplit')}
                </UbButton>
              )}
            </UbStack>
            {row.mode !== 'cash' && (
              <UbTextInput
                id={`${baseId}-ref-${index}`}
                aria-label={t('purchases.payment.reference')}
                placeholder={t('purchases.payment.referencePlaceholder')}
                value={row.reference}
                onChange={(reference) => update(index, { reference })}
                maxLength={64}
              />
            )}
          </UbStack>
        ))}
        {rows.length < 4 && (
          <UbButton
            variant="secondary"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() =>
              setRows((current) => [...current, { mode: 'upi', amount: '', reference: '' }])
            }
          >
            {t('purchases.payment.split')}
          </UbButton>
        )}
        {advance && (
          <UbText variant="body-sm" tone="secondary" role="status">
            {t('purchases.payment.advance', { amount: formatInr(advance) })}
          </UbText>
        )}
      </UbStack>
    </UbDrawer>
  );
}
