'use client';

import dynamic from 'next/dynamic';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectActiveTenant, selectImpersonation } from 'src/redux/slice/sessionSlice';

const ImpersonationBanner = dynamic(
  () =>
    import('modules/DigiKhaato/features/admin/components/ImpersonationBanner').then(
      (module) => module.ImpersonationBanner
    ),
  { ssr: false }
);
const PendingDeletionBanner = dynamic(
  () =>
    import('modules/DigiKhaato/features/account-data/components/PendingDeletionBanner').then(
      (module) => module.PendingDeletionBanner
    ),
  { ssr: false }
);

/**
 * The shell's two rare, whole-app notices (PLT-14 FR-5's support banner and
 * PLT-10's pending-deletion banner). Each is a separate chunk loaded only when
 * the session says it applies, so the shell every merchant downloads carries
 * two selector reads and nothing else.
 */
export function ShellNotices(): React.JSX.Element {
  const impersonating = useAppSelector(selectImpersonation) !== null;
  const pending = useAppSelector(selectActiveTenant)?.status === 'pending_deletion';
  return (
    <>
      {impersonating ? <ImpersonationBanner /> : null}
      {pending ? <PendingDeletionBanner /> : null}
    </>
  );
}
