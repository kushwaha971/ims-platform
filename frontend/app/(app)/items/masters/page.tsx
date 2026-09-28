'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InventoryMastersPageContent } from 'modules/DigiKhaato/features/inventory/components/InventoryMastersPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/inventory';

/** INV-04 — `/items/masters`: categories and units. */
export default function InventoryMastersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <InventoryMastersPageContent />
    </Suspense>
  );
}
