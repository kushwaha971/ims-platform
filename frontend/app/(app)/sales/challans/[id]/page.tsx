'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InvoiceDetailPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceDetailPageContent';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/paymentActions';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/share';

/** Shop item 4 — `/sales/challans/{id}`: the challan, its print sheet, Convert and Void. */
export default function ChallanDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <InvoiceDetailPageContent id={id} kind="delivery_challan" />
    </Suspense>
  );
}
