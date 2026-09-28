'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ItemDetailPageContent } from 'modules/DigiKhaato/features/inventory/components/ItemDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/items';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/stock';

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
