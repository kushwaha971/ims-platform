'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ItemListPageContent } from 'modules/DigiKhaato/features/inventory/components/ItemListPageContent';

/** INV-02 — `/items`. Suspense because the filters live in the URL (`useSearchParams`). */
export default function ItemsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <ItemListPageContent />
    </Suspense>
  );
}
