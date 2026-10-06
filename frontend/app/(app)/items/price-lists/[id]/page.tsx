'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PriceListDetailPageContent } from 'modules/DigiKhaato/features/inventory/components/PriceListDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/priceLists';

/** Shop gap §1.6 — `/items/price-lists/{id}`: one list's rule and pinned rates. */
export default function PriceListDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PriceListDetailPageContent id={id} />
    </Suspense>
  );
}
