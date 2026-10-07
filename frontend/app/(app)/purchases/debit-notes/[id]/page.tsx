'use client';

import { use } from 'react';

import { PurchaseBillDetailPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/purchases';
import 'src/i18n/catalogues/paymentActions';

/** Shop P0 — `/purchases/debit-notes/{id}`: the note, its bill, and Void. */
export default function DebitNoteDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <PurchaseBillDetailPageContent id={id} kind="debit_note" />;
}
