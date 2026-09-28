'use client';

import { use } from 'react';

import { PurchaseBillEditorPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillEditorPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/purchases';
import 'src/i18n/catalogues/validation';
import 'src/i18n/catalogues/money';

/** PUR-01 FR-8 — `/purchases/bills/{id}/edit`: finish a draft. */
export default function EditPurchaseBillPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <PurchaseBillEditorPageContent documentId={id} />;
}
