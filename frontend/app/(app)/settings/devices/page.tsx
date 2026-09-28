'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { DevicesPageContent } from 'modules/DigiKhaato/features/sessions/components/DevicesPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/sessions';

/** PLT-09 — Settings → Devices. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function DevicesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <DevicesPageContent />
    </Suspense>
  );
}
