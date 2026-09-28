'use client';

import { useEffect, type ReactNode } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { UbPageSkeleton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import {
  selectIsSuperAdmin,
  selectMustChangePassword,
  selectSessionStatus,
  selectSessionTenants,
} from 'src/redux/slice/sessionSlice';
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
 *
 * **DEC-012 — the forced password change outranks everything above it.** A
 * member created by an owner arrives on a password somebody else chose, and the
 * SERVER refuses every route but the change itself. So this guard has to send
 * them there before it asks any of its other questions: a person in that state
 * whose only membership is the business they were just added to would otherwise
 * be read as `no_tenant` — the session fetch that would have populated
 * `activeTenant` is one of the requests being refused — and bounced into the
 * onboarding wizard to create a business they do not want, on an account they
 * cannot yet use.
 */
export function RequireSession({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element | null {
  const status = useAppSelector(selectSessionStatus);
  const tenants = useAppSelector(selectSessionTenants);
  const mustChangePassword = useAppSelector(selectMustChangePassword);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
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
      return;
    }
    // Before any tenant question: the server will refuse everything else.
    if (mustChangePassword) {
      router.replace(ROUTES.SET_PASSWORD);
      return;
    }
    if (status === 'no_tenant' && !noTenantAllowed) {
      // PLT-14 — an operator with no business of their own belongs in the
      // console, not in the onboarding wizard. This is also where a support
      // session lands when its token lapses and the refresh restores the
      // operator's own, tenant-less session.
      if (isSuperAdmin && tenants.length === 0) {
        router.replace(ROUTES.ADMIN_TENANTS);
        return;
      }
      router.replace(
        noTenantDestination(tenants) === 'chooser' ? ROUTES.SWITCH_TENANT : ROUTES.ONBOARDING
      );
    }
  }, [status, router, pathname, tenants, noTenantAllowed, mustChangePassword, isSuperAdmin]);

  if (status === 'loading' || status === 'idle') return <UbPageSkeleton variant="app" />;
  if (status === 'anonymous') return null;
  if (mustChangePassword) return null;
  if (status === 'no_tenant' && !noTenantAllowed) return null;
  return <>{children}</>;
}
