'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ResetPasswordPageContent } from 'modules/DigiKhaato/features/auth/components/ResetPasswordPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/auth';
import 'src/i18n/catalogues/validation';

/** PLT-02 FR-5 — the landing page of the reset link, `?token=…`. */
export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
