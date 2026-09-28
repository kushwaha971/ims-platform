'use client';

import { Suspense } from 'react';

import { useSearchParams } from 'next/navigation';

import { UbPageSkeleton } from 'src/design-system';

import { CreditNoteEditorPageContent } from 'modules/DigiKhaato/features/sales/components/CreditNoteEditorPageContent';

function NewCreditNote(): React.JSX.Element {
  const search = useSearchParams();
  return <CreditNoteEditorPageContent againstId={search?.get('against') ?? null} />;
}

/** SAL-04 §6 — `/sales/credit-notes/new?against=<invoice>`: "Return items" from a bill. */
export default function NewCreditNotePage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <NewCreditNote />
    </Suspense>
  );
}
