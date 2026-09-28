'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SettingsPageContent } from 'modules/DigiKhaato/features/settings/components/SettingsPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/settings';
import 'src/i18n/catalogues/settingsGate';
import 'src/i18n/catalogues/validation';

/** PLT-06 — Settings. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function SettingsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" />}>
      <SettingsPageContent />
    </Suspense>
  );
}
