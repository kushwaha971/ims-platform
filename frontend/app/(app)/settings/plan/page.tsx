'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PlanPageContent } from 'modules/UdhaarBook/features/plan/components/PlanPageContent';

/** PLT-15 FR-7 — Settings → Plan. */
export default function PlanPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PlanPageContent />
    </Suspense>
  );
}
