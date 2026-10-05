'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PartyListPageContent } from 'modules/DigiKhaato/features/parties/components/PartyListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/parties';
import 'src/i18n/catalogues/partyBooks';

/** docs/platform/14 step 3b — the Shop's suppliers: the party list, type fixed. */
export default function SuppliersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <PartyListPageContent kind="supplier" />
    </Suspense>
  );
}
