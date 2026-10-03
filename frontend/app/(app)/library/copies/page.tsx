'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { CopyListPageContent } from 'modules/DigiKhaato/features/library/components/CopyListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** F03 (LIB-02) — `/library/copies`, every copy. Suspense, because the filters live in the URL (`useSearchParams`). */
export default function Page(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <CopyListPageContent />
    </Suspense>
  );
}
