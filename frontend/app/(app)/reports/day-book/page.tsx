'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { DayBookPageContent } from 'modules/DigiKhaato/features/reports/components/DayBookPageContent';

/**
 * RPT-02 — `/reports/day-book`. The Suspense boundary is required, not
 * ceremonial: the period and the type filter live in the URL
 * (`useSearchParams`), so an owner can send the accountant last month's
 * payments as a link.
 */
export default function DayBookPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <DayBookPageContent />
    </Suspense>
  );
}
