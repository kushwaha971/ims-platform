'use client';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/validation';

/** Shop item 3 — `/sales/orders/new`: the bill editor in order mode. */
export default function NewSalesOrderPage(): React.JSX.Element {
  return <InvoiceEditorPageContent documentId={null} kind="sales_order" />;
}
