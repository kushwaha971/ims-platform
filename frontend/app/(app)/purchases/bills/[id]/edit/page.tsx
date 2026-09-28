'use client';

import { use } from 'react';

import { PurchaseBillEditorPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillEditorPageContent';

/** PUR-01 FR-8 — `/purchases/bills/{id}/edit`: finish a draft. */
export default function EditPurchaseBillPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <PurchaseBillEditorPageContent documentId={id} />;
}
