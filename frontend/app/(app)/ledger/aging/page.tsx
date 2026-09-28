'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AgingPageContent } from 'modules/DigiKhaato/features/ledger/components/AgingPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/ledger';

/**
 * LED-09 FR-3 — `/ledger/aging`.
 *
 * Part 19 §19.1.4: a Suspense boundary and one page-content import. The
 * Suspense is required rather than ceremonial — the filter lives in the URL
 * (`useSearchParams`), which is what lets an owner send an accountant the
 * year-end view by pasting a link.
 */
export default function LedgerAgingPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <AgingPageContent />
    </Suspense>
  );
}
