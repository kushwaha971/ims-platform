'use client';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/sales';

/** SAL-01 — `/sales/estimates/new`: the bill editor in estimate mode (TSK-SAL-01-07). */
export default function NewEstimatePage(): React.JSX.Element {
  return <InvoiceEditorPageContent documentId={null} kind="estimate" />;
}
