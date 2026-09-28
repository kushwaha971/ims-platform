'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PurchaseRegisterPageContent } from 'modules/DigiKhaato/features/reports/components/PurchaseRegisterPageContent';

/** RPT-04 — `/reports/purchase-register`; the filters live in the URL, hence the Suspense. */
export default function PurchaseRegisterPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PurchaseRegisterPageContent />
    </Suspense>
  );
}
