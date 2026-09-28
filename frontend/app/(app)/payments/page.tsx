'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PaymentsPageContent } from 'modules/DigiKhaato/features/payments/components/PaymentsPageContent';

/**
 * PAY-01 FR-10 — `/payments`. A Suspense boundary and one page-content import
 * (Part 19 §19.1.4); the Suspense is required because the filters live in the
 * URL (`useSearchParams`).
 */
export default function PaymentsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PaymentsPageContent />
    </Suspense>
  );
}
