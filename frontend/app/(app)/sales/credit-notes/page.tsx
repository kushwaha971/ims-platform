'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SalesFlowListPageContent } from 'modules/DigiKhaato/features/sales/components/SalesFlowListPageContent';

/** SAL-04 §14 — `/sales/credit-notes`. Suspense because the tab and dates live in the URL. */
export default function CreditNotesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <SalesFlowListPageContent kind="credit_note" />
    </Suspense>
  );
}
