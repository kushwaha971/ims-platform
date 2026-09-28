'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PurchaseBillsListPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillsListPageContent';

/** PUR-03 — `/purchases/bills`. Suspense because the tab and the range live in the URL. */
export default function PurchaseBillsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PurchaseBillsListPageContent />
    </Suspense>
  );
}
