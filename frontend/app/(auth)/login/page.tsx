'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { OtpSignInPageContent } from 'modules/DigiKhaato/features/auth/components/OtpSignInPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/auth';
import 'src/i18n/catalogues/legal';
import 'src/i18n/catalogues/validation';

/** Owner, 9 Oct 2026 — sign in with a mobile number and an OTP. */
export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <OtpSignInPageContent mode="signIn" />
    </Suspense>
  );
}
