'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { CashbookPageContent } from 'modules/DigiKhaato/features/expenses/components/CashbookPageContent';

/**
 * EXP-03 FR-6 — `/cashbook`. The range lives in the URL, so an owner can send
 * the accountant last month's view by pasting a link.
 */
export default function CashbookPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <CashbookPageContent />
    </Suspense>
  );
}
