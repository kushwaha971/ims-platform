'use client';

import { use } from 'react';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';

/** SAL-01 — `/sales/estimates/{id}/edit`: continue a draft estimate. */
export default function EditEstimatePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <InvoiceEditorPageContent documentId={id} kind="estimate" />;
}
