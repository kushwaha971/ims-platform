'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SalesRegisterPageContent } from 'modules/DigiKhaato/features/reports/components/SalesRegisterPageContent';
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/reports';

/**
 * RPT-03 — `/reports/sales-register`. Part 19 §19.1.4: a Suspense boundary and
 * one page-content import; the Suspense is required because the filters live
 * in the URL (`useSearchParams`).
 */
export default function SalesRegisterPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <SalesRegisterPageContent />
    </Suspense>
  );
}
