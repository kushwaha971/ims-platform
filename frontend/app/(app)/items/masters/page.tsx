'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InventoryMastersPageContent } from 'modules/DigiKhaato/features/inventory/components/InventoryMastersPageContent';

/** INV-04 — `/items/masters`: categories and units. */
export default function InventoryMastersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <InventoryMastersPageContent />
    </Suspense>
  );
}
