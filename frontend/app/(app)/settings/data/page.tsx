'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AccountDataPageContent } from 'modules/DigiKhaato/features/account-data/components/AccountDataPageContent';

/** PLT-10 — Settings → Your data. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function AccountDataPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" />}>
      <AccountDataPageContent />
    </Suspense>
  );
}
