'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { StockSummaryPageContent } from 'modules/DigiKhaato/features/inventory/components/StockSummaryPageContent';

/** INV-08 — `/stock/summary`: stock value at weighted-average cost. */
export default function StockSummaryPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <StockSummaryPageContent />
    </Suspense>
  );
}
