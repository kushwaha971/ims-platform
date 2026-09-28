'use client';

import { FileText, IndianRupee, ShoppingCart } from 'lucide-react';

import { UbStatCard, UbStatGrid } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import type { PurchaseBillTotals } from '../types/purchase.types';

/**
 * PUR-03 FR-3 / US-3 — bought, to pay and bills over the FILTERED set, across
 * every page (the server's `meta.totals`; drafts and voids are never in the
 * money). The count drops below `md`, as on the sales list (the phone fold).
 */
export function PurchaseBillListStats({
  totals,
}: Readonly<{ totals: PurchaseBillTotals }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbStatGrid>
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
    </UbStatGrid>
  );
}
