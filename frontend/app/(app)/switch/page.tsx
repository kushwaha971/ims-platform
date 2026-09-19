'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { TenantChooserPageContent } from 'modules/UdhaarBook/features/tenant-switcher/components/TenantChooserPageContent';

/** PLT-04 FR-9 / §7 — the full-screen business chooser. */
export default function SwitchTenantPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <TenantChooserPageContent />
    </Suspense>
  );
}
