'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { LoginPageContent } from 'modules/DigiKhaato/features/auth/components/LoginPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/auth';
import 'src/i18n/catalogues/validation';

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <LoginPageContent />
    </Suspense>
  );
}
