'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { RemindersPageContent } from 'modules/DigiKhaato/features/reminders/components/RemindersPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/ledger';
import 'src/i18n/catalogues/reminders';
import 'src/i18n/catalogues/share';

/**
 * LED-05/06/07 — `/ledger/reminders`.
 *
 * Part 19 §19.1.4: a Suspense boundary and one page-content import. The tab
 * lives in the URL (`?bucket=today`), which is what lets the inbox's "3
 * parties have a payment due today" open exactly that list.
 */
export default function LedgerRemindersPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <RemindersPageContent />
    </Suspense>
  );
}
