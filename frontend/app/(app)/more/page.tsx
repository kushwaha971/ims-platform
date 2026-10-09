'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { MorePageContent } from 'modules/DigiKhaato/features/navigation/components/MorePageContent';

/** docs/mobile-redesign/03 — the phone's More tab: everything that is not a tab. */
export default function MorePage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <MorePageContent />
    </Suspense>
  );
}
