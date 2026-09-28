'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InvoicesListPageContent } from 'modules/DigiKhaato/features/sales/components/InvoicesListPageContent';

/** SAL-08 — `/sales/invoices`. Suspense because the tab and dates live in the URL. */
export default function InvoicesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <InvoicesListPageContent />
    </Suspense>
  );
}
