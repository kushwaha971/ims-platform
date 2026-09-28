'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ImportPageContent } from 'modules/DigiKhaato/features/imports/components/ImportPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/imports';

/**
 * IMP-01 — `/imports`: the wizard. `?kind=` preselects what is imported (the
 * Parties and Items pages link here with it); `?export=` shows a stored export.
 * The Suspense is required because both live in the URL (`useSearchParams`).
 */
export default function ImportsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <ImportPageContent />
    </Suspense>
  );
}
