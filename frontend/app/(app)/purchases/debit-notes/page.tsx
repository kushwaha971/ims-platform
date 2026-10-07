'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PurchaseBillsListPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillsListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/purchases';

/** Shop P0 — `/purchases/debit-notes`: goods sent back to suppliers. */
export default function DebitNotesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PurchaseBillsListPageContent kind="debit_note" />
    </Suspense>
  );
}
