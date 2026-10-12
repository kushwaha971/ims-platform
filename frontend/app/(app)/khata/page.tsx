'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PartyListPageContent } from 'modules/DigiKhaato/features/parties/components/PartyListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/parties';
import 'src/i18n/catalogues/partyBooks';

/** DEC-019 — the Udhaar book's people: You gave / You got, an app of its own. */
export default function KhataPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <PartyListPageContent book="main" />
    </Suspense>
  );
}
