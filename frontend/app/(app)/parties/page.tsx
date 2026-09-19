'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PartyListPageContent } from 'modules/DigiKhaato/features/parties/components/PartyListPageContent';

/**
 * Part 19 §19.1.4 — this is the ENTIRE file, and every application route looks
 * like it: a Suspense boundary and one page-content import. A route that grows
 * a useState, a useEffect or an import from src/api has been written in the
 * wrong place.
 */
export default function PartiesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <PartyListPageContent />
    </Suspense>
  );
}
