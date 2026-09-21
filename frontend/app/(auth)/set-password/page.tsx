'use client';

import { Suspense } from 'react';

import { UbPageSkeleton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectMustChangePassword } from 'src/redux/slice/sessionSlice';

import { ForcePasswordChangePageContent } from 'modules/DigiKhaato/features/auth/components/ForcePasswordChangePageContent';
import { SetPasswordPageContent } from 'modules/DigiKhaato/features/auth/components/SetPasswordPageContent';

/**
 * One address, two situations, and they are genuinely different screens.
 *
 * `SetPasswordPageContent` (PLT-02 FR-3) is for an account that reached a
 * session with NO password: it is optional, it has a Skip, and it goes on to
 * the onboarding wizard.
 *
 * `ForcePasswordChangePageContent` (DEC-011) is for an account on a password a
 * business owner generated and sent by hand: it is mandatory, it has no Skip,
 * it asks for the temporary password, and it goes to the dashboard. The server
 * refuses every other route until it is done.
 *
 * They share a route because `RequireSession` sends the second kind here and a
 * second address would be one more thing to keep in step with the guard. They
 * do not share a component, because folding them together would put three
 * conditionals inside the one screen that decides whether a person can use the
 * product at all.
 */
function SetPasswordRoute(): React.JSX.Element {
  const mustChange = useAppSelector(selectMustChangePassword);
  return mustChange ? <ForcePasswordChangePageContent /> : <SetPasswordPageContent />;
}

export default function SetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={<UbPageSkeleton variant="form" count={3} />}>
      <SetPasswordRoute />
    </Suspense>
  );
}
