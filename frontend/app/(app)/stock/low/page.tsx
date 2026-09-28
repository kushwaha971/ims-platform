'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { LowStockPageContent } from 'modules/DigiKhaato/features/inventory/components/LowStockPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/items';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/stock';

/** INV-07 — `/stock/low`: items at or below their reorder point. */
export default function LowStockPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <LowStockPageContent />
    </Suspense>
  );
}
