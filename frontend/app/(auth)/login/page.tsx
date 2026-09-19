'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';

import { LoginPageContent } from 'modules/DigiKhaato/features/auth/components/LoginPageContent';

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={2} />}>
      <LoginPageContent />
    </Suspense>
  );
}
