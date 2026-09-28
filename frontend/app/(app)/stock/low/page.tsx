'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { LowStockPageContent } from 'modules/DigiKhaato/features/inventory/components/LowStockPageContent';

/** INV-07 — `/stock/low`: items at or below their reorder point. */
export default function LowStockPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <LowStockPageContent />
    </Suspense>
  );
}
