'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { AuditLogPageContent } from 'modules/DigiKhaato/features/audit-log/components/AuditLogPageContent';
import { SettingsGate } from 'modules/DigiKhaato/features/settings/components/SettingsGate';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/audit';
import 'src/i18n/catalogues/settings';

/** PLT-08 — Settings → Activity log. Part 19 §19.1.4: a Suspense boundary and one import. */
export default function ActivityPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <SettingsGate need="canReadAudit">
        <AuditLogPageContent />
      </SettingsGate>
    </Suspense>
  );
}
