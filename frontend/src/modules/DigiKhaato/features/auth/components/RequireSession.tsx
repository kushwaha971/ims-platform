'use client';

import { useEffect, type ReactNode } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { UbPageSkeleton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectSessionStatus, selectSessionTenants } from 'src/redux/slice/sessionSlice';
import { ROUTES, loginPathWithNext } from 'src/routes';

import { noTenantDestination } from '../view-model/authDisplay';

/**
 * Part 19 §19.7.3 — the real guard. `proxy.ts` does the cheap
 * cookie-presence check before any JS ships; this one checks the session the
 * server actually confirmed, because a cookie can exist and still be invalid.
 *
 * Until the session resolves, `(app)` routes render a skeleton and NOT a flash
 * of the login screen. That is the most visible correctness detail in the whole
 * auth flow, and it is worth the extra state.
 *
 * **`no_tenant` is not one situation.** `sessionSlice` sets it whenever
 * `activeTenant` is null, which covers a brand-new account with no business, an
 * account whose ONLY membership is an invitation (PLT-01 EC-5), and an account
 * with several active memberships and no default (PLT-04 FR-9). This guard used
 * to send all three to `/onboarding` — and `/switch`, the one screen that lists
 * an invitation, lives under `(app)` behind this guard, so the second and third
 * kinds of user were bounced out of the only screen that could help them and
 * into a wizard for a business they never wanted to create. `postAuthDestination`
 * routes them to `/switch` correctly; this is where that routing was undone.
 *
 * `noTenantDestination` is the shared rule, so the guard and the post-login
 * redirect cannot drift apart.
 */
export function RequireSession({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element | null {
  const status = useAppSelector(selectSessionStatus);
  const tenants = useAppSelector(selectSessionTenants);
  const router = useRouter();
  const pathname = usePathname();

  // The chooser is the destination for a tenant-less session that has
  // something to choose, so it cannot also be a place this guard redirects
  // away from — that is the bounce.
  const isChooser = pathname === ROUTES.SWITCH_TENANT;
  const noTenantAllowed = isChooser && noTenantDestination(tenants) === 'chooser';

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(loginPathWithNext(pathname));
    }
    if (status === 'no_tenant' && !noTenantAllowed) {
      router.replace(
        noTenantDestination(tenants) === 'chooser' ? ROUTES.SWITCH_TENANT : ROUTES.ONBOARDING
      );
    }
  }, [status, router, pathname, tenants, noTenantAllowed]);

  if (status === 'loading' || status === 'idle') return <UbPageSkeleton variant="app" />;
  if (status === 'anonymous') return null;
  if (status === 'no_tenant' && !noTenantAllowed) return null;
  return <>{children}</>;
}
