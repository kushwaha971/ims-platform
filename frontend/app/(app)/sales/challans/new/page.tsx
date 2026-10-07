'use client';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/validation';

/** Shop item 4 — `/sales/challans/new`: the bill editor in challan mode. */
export default function NewChallanPage(): React.JSX.Element {
  return <InvoiceEditorPageContent documentId={null} kind="delivery_challan" />;
}
