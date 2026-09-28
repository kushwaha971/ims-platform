'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InvoicesListPageContent } from 'modules/DigiKhaato/features/sales/components/InvoicesListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/sales';

/** SAL-08 — `/sales/invoices`. Suspense because the tab and dates live in the URL. */
export default function InvoicesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <InvoicesListPageContent />
    </Suspense>
  );
}
