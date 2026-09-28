'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ExpensesPageContent } from 'modules/DigiKhaato/features/expenses/components/ExpensesPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/expenses';
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/period';

/**
 * EXP-01 FR-1 — `/expenses`. A Suspense boundary and one page-content import
 * (Part 19 §19.1.4); the Suspense is required because the filters live in the
 * URL (`useSearchParams`).
 */
export default function ExpensesPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <ExpensesPageContent />
    </Suspense>
  );
}
