'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SalesFlowListPageContent } from 'modules/DigiKhaato/features/sales/components/SalesFlowListPageContent';

/** SAL-01 FR-10 — `/sales/estimates`. Suspense because the tab and dates live in the URL. */
export default function EstimatesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <SalesFlowListPageContent kind="estimate" />
    </Suspense>
  );
}
