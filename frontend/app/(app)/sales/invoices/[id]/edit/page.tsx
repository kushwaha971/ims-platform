'use client';

import { use } from 'react';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';

/** SAL-06 — `/sales/invoices/{id}/edit`: continue a draft (server copy, device copy offered). */
export default function EditInvoicePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <InvoiceEditorPageContent documentId={id} />;
}
