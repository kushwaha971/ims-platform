'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ResetPasswordPageContent } from 'modules/UdhaarBook/features/auth/components/ResetPasswordPageContent';

/** PLT-02 FR-5 — the landing page of the reset link, `?token=…`. */
export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
