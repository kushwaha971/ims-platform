'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InvoiceDetailPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceDetailPageContent';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/paymentActions';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/share';

/** Shop item 3 — `/sales/orders/{id}`: the order, its print sheet, Convert and Cancel. */
export default function SalesOrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <InvoiceDetailPageContent id={id} kind="sales_order" />
    </Suspense>
  );
}
