'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { BusinessDaysPageContent } from 'modules/DigiKhaato/features/calendar/components/BusinessDaysPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/calendar';
import 'src/i18n/catalogues/settingsGate';

/** A9b (PLT-X08) — Settings → Business days. A Suspense boundary and one import. */
export default function BusinessDaysPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <BusinessDaysPageContent />
    </Suspense>
  );
}
