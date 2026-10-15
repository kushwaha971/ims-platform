'use client';
import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AgingPageContent } from 'modules/DigiKhaato/features/ledger/components/AgingPageContent';
import 'src/i18n/catalogues/ledger';
/** Shop's aging reuses the shared report without entering the Udhaar app. */
export default function ShopAgingPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <AgingPageContent book="shop" />
    </Suspense>
  );
}
