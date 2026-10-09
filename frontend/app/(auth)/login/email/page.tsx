'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { LoginPageContent } from 'modules/DigiKhaato/features/auth/components/LoginPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/auth';
import 'src/i18n/catalogues/validation';

/**
 * The email + password sign-in, kept at an address nothing links to: /login
 * is mobile + OTP since 9 Oct 2026. It is here for the platform operator's
 * console account and for an account made before the change that has no
 * mobile on it yet — not for merchants, and no screen sends anyone here.
 */
export default function EmailLoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <LoginPageContent />
    </Suspense>
  );
}
