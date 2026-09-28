'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PaymentsPageContent } from 'modules/DigiKhaato/features/payments/components/PaymentsPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/paymentActions';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/period';

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
