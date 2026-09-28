'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PartyDetailPageContent } from 'modules/DigiKhaato/features/parties/components/PartyDetailPageContent';

/**
 * Part 19 §19.1.4 — a route is a Suspense boundary and one page-content import.
 *
 * The only thing this one does beyond that is unwrap `params`, which Next 16
 * hands over as a promise. `use()` is the sanctioned way to read it in a client
 * component, and it belongs here rather than inside the feature: the page
 * content takes an id, not a router shape, which is what makes it testable
 * without a router.
 */
export default function PartyDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);

  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PartyDetailPageContent id={id} />
    </Suspense>
  );
}
