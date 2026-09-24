'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AuditLogPageContent } from 'modules/DigiKhaato/features/audit-log/components/AuditLogPageContent';

/** PLT-08 — Settings → Activity log. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function ActivityPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <AuditLogPageContent />
    </Suspense>
  );
}
