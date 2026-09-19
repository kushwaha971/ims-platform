'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SetPasswordPageContent } from 'modules/UdhaarBook/features/auth/components/SetPasswordPageContent';

/** PLT-02 FR-3 — "Set your password", for an account that has none (PLT-05). */
export default function SetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={3} />}>
      <SetPasswordPageContent />
    </Suspense>
  );
}
