'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AdminPartnersPageContent } from 'modules/DigiKhaato/features/admin/components/AdminPartnersPageContent';

/** PLT-14 FR-4 — the partners. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function AdminPartnersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <AdminPartnersPageContent />
    </Suspense>
  );
}
