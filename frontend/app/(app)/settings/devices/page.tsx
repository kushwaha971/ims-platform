'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { DevicesPageContent } from 'modules/DigiKhaato/features/sessions/components/DevicesPageContent';

/** PLT-09 — Settings → Devices. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function DevicesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <DevicesPageContent />
    </Suspense>
  );
}
