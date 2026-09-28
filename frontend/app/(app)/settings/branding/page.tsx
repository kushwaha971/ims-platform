'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { BrandingPageContent } from 'modules/DigiKhaato/features/branding/components/BrandingPageContent';
import { SettingsGate } from 'modules/DigiKhaato/features/settings/components/SettingsGate';

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
