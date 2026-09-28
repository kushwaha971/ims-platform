'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { InvoiceDetailPageContent } from 'modules/DigiKhaato/features/sales/components/InvoiceDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/paymentActions';
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/sales';
import 'src/i18n/catalogues/share';

/** SAL-03 — `/sales/invoices/{id}`: the bill, its print sheet and its share actions. */
export default function InvoiceDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <InvoiceDetailPageContent id={id} />
    </Suspense>
  );
}
