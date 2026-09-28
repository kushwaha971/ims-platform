'use client';

import { use } from 'react';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';

/** SAL-01 — `/sales/estimates/{id}/edit`: continue a draft estimate. */
export default function EditEstimatePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <InvoiceEditorPageContent documentId={id} kind="estimate" />;
}
