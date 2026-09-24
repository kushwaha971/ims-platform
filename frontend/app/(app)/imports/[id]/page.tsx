'use client';

import { Suspense, use } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ImportPageContent } from 'modules/DigiKhaato/features/imports/components/ImportPageContent';

/** IMP-01 — `/imports/{id}`: one import, the notification's deep link (§17). */
export default function ImportJobPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>): React.JSX.Element {
  const { id } = use(params);

  return (
    <Suspense fallback={<UbPageSkeleton variant="card" />}>
      <ImportPageContent jobId={id} />
    </Suspense>
  );
}
