'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SignUpPageContent } from 'modules/DigiKhaato/features/auth/components/SignUpPageContent';

/** CR-2026-09-19-A FR-S1 — email + password sign-up. Part 19 §19.1.4: this is the whole file. */
export default function SignUpPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={4} />}>
      <SignUpPageContent />
    </Suspense>
  );
}
