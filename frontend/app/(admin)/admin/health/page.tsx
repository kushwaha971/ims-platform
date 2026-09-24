'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AdminHealthPageContent } from 'modules/DigiKhaato/features/admin/components/AdminHealthPageContent';

/** PLT-14 FR-7 — the health view. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function AdminHealthPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <AdminHealthPageContent />
    </Suspense>
  );
}
