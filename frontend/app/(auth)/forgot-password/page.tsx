'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { ForgotPasswordPageContent } from 'modules/UdhaarBook/features/auth/components/ForgotPasswordPageContent';

/** PLT-02 FR-4 — ask for a reset link; `/reset-password` is where it lands. */
export default function ForgotPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
