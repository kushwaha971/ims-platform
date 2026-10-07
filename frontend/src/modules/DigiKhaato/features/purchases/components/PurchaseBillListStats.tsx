'use client';

import { FileText, IndianRupee, ShoppingCart, Undo2 } from 'lucide-react';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import { UbStatCard } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import type { PurchaseBillTotals, PurchaseKind } from '../types/purchase.types';

/**
 * PUR-03 FR-3 / US-3 — bought, to pay and bills over the FILTERED set, across
 * every page (the server's `meta.totals`; drafts and voids are never in the
 * money). The count drops below `md`, as on the sales list (the phone fold).
 */
export function PurchaseBillListStats({
  totals,
  order = false,
  kind = 'purchase_bill',
}: Readonly<{
  totals: PurchaseBillTotals;
  order?: boolean;
  kind?: PurchaseKind;
}>): React.JSX.Element {
  const { t } = useTranslation();
  if (kind === 'debit_note') {
    // Shop P0 — what went back to suppliers, and the credit no bill could take.
    return (
      <SummaryStatGrid storageKey="debitNotes">
        <UbStatCard
          icon={<Undo2 className="h-4 w-4" aria-hidden />}
          label={t('purchases.debitNote.returned')}
          value={formatInr(totals.grandTotal)}
        />
        <UbStatCard
          icon={<IndianRupee className="h-4 w-4" aria-hidden />}
          label={t('purchases.debitNote.openCredit')}
          value={formatInr(totals.amountDue)}
        />
      </SummaryStatGrid>
    );
  }
  if (order) {
    // Shop item 3 — an order owes nothing: what is on order, and how many orders.
    return (
      <SummaryStatGrid storageKey="purchaseOrders">
        <UbStatCard
          icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
          label={t('purchases.order.onOrder')}
          value={formatInr(totals.grandTotal)}
        />
        <UbStatCard
          icon={<FileText className="h-4 w-4" aria-hidden />}
          label={t('purchases.order.count')}
          value={String(totals.count)}
        />
      </SummaryStatGrid>
    );
  }
  return (
    <SummaryStatGrid storageKey="purchases">
      <UbStatCard
        icon={<ShoppingCart className="h-4 w-4" aria-hidden />}
        label={t('purchases.total.bought')}
        value={formatInr(totals.grandTotal)}
      />
      <UbStatCard
        icon={<IndianRupee className="h-4 w-4" aria-hidden />}
        label={t('purchases.total.toPay')}
        value={formatInr(totals.amountDue)}
      />
      <UbStatCard
        icon={<FileText className="h-4 w-4" aria-hidden />}
        label={t('purchases.total.count')}
        value={String(totals.count)}
        className="max-md:hidden"
      />
    </SummaryStatGrid>
  );
}
