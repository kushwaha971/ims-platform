'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AdminTenantsPageContent } from 'modules/DigiKhaato/features/admin/components/AdminTenantsPageContent';

/** PLT-14 FR-2 — every business. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function AdminTenantsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <AdminTenantsPageContent />
    </Suspense>
  );
}
