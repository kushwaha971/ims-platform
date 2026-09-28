'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { StockSummaryPageContent } from 'modules/DigiKhaato/features/inventory/components/StockSummaryPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/items';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/stock';
import 'src/i18n/catalogues/exports';

/** INV-08 — `/stock/summary`: stock value at weighted-average cost. */
export default function StockSummaryPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <StockSummaryPageContent />
    </Suspense>
  );
}
