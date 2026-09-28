'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { BrandingPageContent } from 'modules/DigiKhaato/features/branding/components/BrandingPageContent';
import { SettingsGate } from 'modules/DigiKhaato/features/settings/components/SettingsGate';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/branding';
import 'src/i18n/catalogues/settings';
import 'src/i18n/catalogues/validation';

/** WLB-01 — Settings → Branding. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function BrandingPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" />}>
      <SettingsGate need="canView">
        <BrandingPageContent />
      </SettingsGate>
    </Suspense>
  );
}
