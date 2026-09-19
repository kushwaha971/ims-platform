'use client';

import { useEffect, type ReactNode } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { UbPageSkeleton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectSessionStatus } from 'src/redux/slice/sessionSlice';
import { ROUTES, loginPathWithNext } from 'src/routes';

/**
 * Part 19 §19.7.3 — the real guard. `proxy.ts` does the cheap
 * cookie-presence check before any JS ships; this one checks the session the
 * server actually confirmed, because a cookie can exist and still be invalid.
 *
 * Until the session resolves, `(app)` routes render a skeleton and NOT a flash
 * of the login screen. That is the most visible correctness detail in the whole
 * auth flow, and it is worth the extra state.
 */
export function RequireSession({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element | null {
  const status = useAppSelector(selectSessionStatus);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(loginPathWithNext(pathname));
    }
    if (status === 'no_tenant') {
      router.replace(ROUTES.ONBOARDING);
    }
  }, [status, router, pathname]);

  if (status === 'loading' || status === 'idle') return <UbPageSkeleton variant="app" />;
  if (status === 'anonymous' || status === 'no_tenant') return null;
  return <>{children}</>;
}
