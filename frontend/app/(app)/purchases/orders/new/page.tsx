'use client';

import { PurchaseBillEditorPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillEditorPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/itemPicker';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/purchases';
import 'src/i18n/catalogues/validation';
import 'src/i18n/catalogues/money';

/** Shop item 3 — `/purchases/orders/new`: what to ask a supplier for. */
export default function NewPurchaseOrderPage(): React.JSX.Element {
  return <PurchaseBillEditorPageContent documentId={null} kind="purchase_order" />;
}
