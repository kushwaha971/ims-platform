'use client';

import { InvoiceEditorPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceEditorPageContent';

/** SAL-01 — `/sales/estimates/new`: the bill editor in estimate mode (TSK-SAL-01-07). */
export default function NewEstimatePage(): React.JSX.Element {
  return <InvoiceEditorPageContent documentId={null} kind="estimate" />;
}
