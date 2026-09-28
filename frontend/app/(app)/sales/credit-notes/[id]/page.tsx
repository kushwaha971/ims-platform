'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InvoiceDetailPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceDetailPageContent';

/** SAL-04 §9 — `/sales/credit-notes/{id}`: the note, its print sheet, apply and void. */
export default function CreditNoteDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <InvoiceDetailPageContent id={id} kind="credit_note" />
    </Suspense>
  );
}
