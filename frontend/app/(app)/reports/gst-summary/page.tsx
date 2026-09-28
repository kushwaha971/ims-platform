'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { GstSummaryPageContent } from 'modules/DigiKhaato/features/reports/components/GstSummaryPageContent';

/** RPT-07 — `/reports/gst-summary`; period, view and rounding live in the URL. */
export default function GstSummaryPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <GstSummaryPageContent />
    </Suspense>
  );
}
