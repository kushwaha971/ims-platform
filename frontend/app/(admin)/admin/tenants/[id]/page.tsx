'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AdminTenantDetailPageContent } from 'modules/DigiKhaato/features/admin/components/AdminTenantDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/data';

/** PLT-14 FR-3 — one business's card. `params` is a promise in Next 16; `use()` unwraps it. */
export default function AdminTenantDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <AdminTenantDetailPageContent id={id} />
    </Suspense>
  );
}
