'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { BusinessProfilePageContent } from 'modules/DigiKhaato/features/business-profile/components/BusinessProfilePageContent';
import { SettingsGate } from 'modules/DigiKhaato/features/settings/components/SettingsGate';

/** PLT-07 — Settings → Business profile. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function BusinessProfilePage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" />}>
      <SettingsGate need="canView">
        <BusinessProfilePageContent />
      </SettingsGate>
    </Suspense>
  );
}
