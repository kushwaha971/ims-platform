'use client';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';

/** SAL-02 / SAL-07 — `/sales/invoices/new`: a new bill (walk-in or party). */
export default function NewInvoicePage(): React.JSX.Element {
  return <InvoiceEditorPageContent documentId={null} />;
}
