'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ItemListPageContent } from 'modules/DigiKhaato/features/inventory/components/ItemListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/items';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/stock';

/** INV-02 — `/items`. Suspense because the filters live in the URL (`useSearchParams`). */
export default function ItemsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <ItemListPageContent />
    </Suspense>
  );
}
