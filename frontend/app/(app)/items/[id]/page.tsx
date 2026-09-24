'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ItemDetailPageContent } from 'modules/DigiKhaato/features/inventory/components/ItemDetailPageContent';

/** INV-03 — `/items/{id}`: the stock card, pricing and movement history. */
export default function ItemDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);

  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <ItemDetailPageContent id={id} />
    </Suspense>
  );
}
