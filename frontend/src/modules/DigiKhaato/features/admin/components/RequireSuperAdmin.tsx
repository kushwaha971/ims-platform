'use client';

import { useEffect, type ReactNode } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { UbActionLink, UbEmptyState, UbPageSkeleton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import {
  selectImpersonation,
  selectIsSuperAdmin,
  selectMustChangePassword,
  selectSessionStatus,
} from 'src/redux/slice/sessionSlice';
import { ROUTES, loginPathWithNext } from 'src/routes';

/**
 * PLT-14 FR-1 — the console is visible only to `is_super_admin`. This is a
 * courtesy, not the boundary: every `/admin/*` endpoint answers 403 to anyone
 * else, and a support session is refused there too. Unlike `RequireSession`,
 * a session with NO business is welcome here — an operator usually has none.
 */
export function RequireSuperAdmin({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const status = useAppSelector(selectSessionStatus);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const impersonating = useAppSelector(selectImpersonation) !== null;
  const mustChangePassword = useAppSelector(selectMustChangePassword);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(loginPathWithNext(pathname));
    else if (mustChangePassword) router.replace(ROUTES.SET_PASSWORD);
  }, [status, mustChangePassword, router, pathname]);

  if (status === 'idle' || status === 'loading' || status === 'anonymous' || mustChangePassword) {
    return <UbPageSkeleton variant="card" />;
  }
  if (!isSuperAdmin || impersonating) {
    return (
      <UbEmptyState
        variant="firstUse"
        title={impersonating ? t('admin.guard.inSession.title') : t('admin.guard.title')}
        description={impersonating ? t('admin.guard.inSession.body') : t('admin.guard.body')}
        action={
          <UbActionLink href={ROUTES.DASHBOARD} variant="secondary">
            {t('admin.guard.back')}
          </UbActionLink>
        }
      />
    );
  }
  return <>{children}</>;
}
