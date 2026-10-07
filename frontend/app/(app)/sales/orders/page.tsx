'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SalesFlowListPageContent } from 'modules/DigiKhaato/features/sales/components/SalesFlowListPageContent';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/sales';

/** Shop item 3 — `/sales/orders`. Suspense because the tab and dates live in the URL. */
export default function SalesOrdersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <SalesFlowListPageContent kind="sales_order" />
    </Suspense>
  );
}
