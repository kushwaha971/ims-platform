'use client';

import { FileText, IndianRupee, Receipt } from 'lucide-react';

import { UbStatCard, UbStatGrid } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import type { InvoiceListTotals } from '../types/sales.types';

/**
 * SAL-08 FR-5 — billed, due and count over the FILTERED set. The money pair
 * leads; the count is dropped below `md` (the phone fold, owner, 23 Sep 2026)
 * because the "All · n" tab already says it.
 */
export function InvoiceListStats({
  totals,
}: Readonly<{ totals: InvoiceListTotals }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbStatGrid>
      <UbStatCard
        icon={<Receipt className="h-4 w-4" aria-hidden />}
        label={t('sales.total.billed')}
        value={formatInr(totals.grandTotal)}
      />
      <UbStatCard
        icon={<IndianRupee className="h-4 w-4" aria-hidden />}
        label={t('sales.total.due')}
        value={formatInr(totals.amountDue)}
      />
      <UbStatCard
        icon={<FileText className="h-4 w-4" aria-hidden />}
        label={t('sales.total.count')}
        value={String(totals.count)}
        className="max-md:hidden"
      />
    </UbStatGrid>
  );
}
