'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PartyTagsPageContent } from 'modules/DigiKhaato/features/parties/components/PartyTagsPageContent';

/**
 * PTY-05 FR-7 — `/parties/tags`.
 *
 * A STATIC segment beside `[id]`, and Next.js resolves static before dynamic,
 * so this wins over `/parties/{id}` for the literal path "tags". That is also
 * why a party can never be reached at this address — which is fine, because
 * ids are UUIDs and "tags" is not one.
 *
 * Part 19 §19.1.4 — this is the entire file, like every other route.
 */
export default function PartyTagsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <PartyTagsPageContent />
    </Suspense>
  );
}
