'use client';

import { use } from 'react';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/validation';

/** Shop item 4 — `/sales/challans/{id}/edit`: continue a draft challan. */
export default function EditChallanPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <InvoiceEditorPageContent documentId={id} kind="delivery_challan" />;
}
