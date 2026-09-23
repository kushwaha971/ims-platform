'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PartyStatementPageContent } from 'modules/DigiKhaato/features/ledger/components/PartyStatementPageContent';

/**
 * LED-04 FR-1 — `/parties/{id}/statement`.
 *
 * Part 19 §19.1.4: a route is a Suspense boundary and one page-content import.
 * The Suspense is load-bearing here rather than ceremonial — the page content
 * reads `useSearchParams`, which Next requires to be inside one, and the filter
 * living in the URL is what makes the statement linkable (FR-8).
 *
 * Its OWN route rather than a tab on the khata page, and that is the point of
 * the feature: a statement is a document a merchant sends somebody, so it needs
 * an address they can put in a message.
 */
export default function PartyStatementPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);

  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PartyStatementPageContent id={id} />
    </Suspense>
  );
}
