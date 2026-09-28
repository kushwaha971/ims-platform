'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PurchaseBillsListPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillsListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/purchases';

/** PUR-03 — `/purchases/bills`. Suspense because the tab and the range live in the URL. */
export default function PurchaseBillsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PurchaseBillsListPageContent />
    </Suspense>
  );
}
