'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PriceListsPageContent } from 'modules/DigiKhaato/features/inventory/components/PriceListsPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/priceLists';

/** Shop gap §1.6 — `/items/price-lists`: rate cards for groups of customers. */
export default function PriceListsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <PriceListsPageContent />
    </Suspense>
  );
}
