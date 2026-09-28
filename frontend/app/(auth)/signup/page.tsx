'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { SignUpPageContent } from 'modules/DigiKhaato/features/auth/components/SignUpPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/auth';
import 'src/i18n/catalogues/legal';
import 'src/i18n/catalogues/validation';

/** CR-2026-09-19-A FR-S1 — email + password sign-up. Part 19 §19.1.4: this is the whole file. */
export default function SignUpPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={4} />}>
      <SignUpPageContent />
    </Suspense>
  );
}
