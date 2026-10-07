'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ProfitReportPageContent } from 'modules/DigiKhaato/features/reports/components/ProfitReportPageContent';
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/reports';
import 'src/i18n/catalogues/taxReports';

/**
 * Shop item 1 — `/reports/profit`. Part 19 §19.1.4: a Suspense boundary and
 * one page-content import; the Suspense is required because the filters live
 * in the URL (`useSearchParams`).
 */
export default function ProfitReportPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <ProfitReportPageContent />
    </Suspense>
  );
}
