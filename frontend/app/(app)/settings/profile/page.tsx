'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { BusinessProfilePageContent } from 'modules/DigiKhaato/features/business-profile/components/BusinessProfilePageContent';
import { SettingsGate } from 'modules/DigiKhaato/features/settings/components/SettingsGate';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/branding';
import 'src/i18n/catalogues/businessProfile';
import 'src/i18n/catalogues/onboarding';
import 'src/i18n/catalogues/settingsGate';
import 'src/i18n/catalogues/validation';

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
