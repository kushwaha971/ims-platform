'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { PaymentReceiptPageContent } from 'modules/DigiKhaato/features/payments/components/PaymentReceiptPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/payments';
import 'src/i18n/catalogues/share';

/** PAY-04 — `/payments/{id}`: the receipt, its print sheet, share and void. */
export default function PaymentReceiptPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <PaymentReceiptPageContent id={id} />
    </Suspense>
  );
}
