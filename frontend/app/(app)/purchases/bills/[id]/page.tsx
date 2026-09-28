'use client';

import { use } from 'react';

import { PurchaseBillDetailPageContent } from 'modules/DigiKhaato/features/purchases/components/PurchaseBillDetailPageContent';

/** PUR-01 FR-9 / PUR-04 — `/purchases/bills/{id}`: the bill, and its void. */
export default function PurchaseBillDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return <PurchaseBillDetailPageContent id={id} />;
}
