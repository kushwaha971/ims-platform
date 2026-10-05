'use client';

import { useEffect, type ReactNode } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { UbPageSkeleton } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectLanding, selectSessionStatus } from 'src/redux/slice/sessionSlice';
import { ROUTES, loginPathWithNext } from 'src/routes';

import { isTenantless, landingRoute } from '../view-model/landing';

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
 * **docs/platform/14 §4.1 — the guard asks the server's `landing`.** It used
 * to apply its own rule (`noTenantDestination`) beside the sign-in's
 * (`postAuthDestination`), and the two disagreed: a deep link walked past the
 * wizard the sign-in sent the same person into. Now both read `landing` from
 * the same session body, so sign-in, refresh and a deep link agree.
 *
 * What the guard enforces is what the person cannot use the app without: the
 * password change, and having a business at all. An owner's unfinished setup
 * (`business_setup`) is NOT enforced here — the business works, the page they
 * opened is theirs to use, and the next sign-in resumes the wizard.
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
  const landing = useAppSelector(selectLanding);
  const router = useRouter();
  const pathname = usePathname();

  // The chooser is where a tenant-less session with something to choose goes,
  // so it cannot also be a place this guard sends people away from — that is
  // the bounce.
  const isChooser = pathname === ROUTES.SWITCH_TENANT;
  const mustChange = landing.kind === 'set_password';
  const blocked =
    mustChange ||
    (status === 'no_tenant' &&
      isTenantless(landing) &&
      !(isChooser && (landing.kind === 'choose_business' || landing.kind === 'invitation')));

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(loginPathWithNext(pathname));
      return;
    }
    if (blocked) router.replace(landingRoute(landing, ROUTES.DASHBOARD));
  }, [status, router, pathname, blocked, landing]);

  if (status === 'loading' || status === 'idle') return <UbPageSkeleton variant="app" />;
  if (status === 'anonymous') return null;
  if (blocked) return null;
  return <>{children}</>;
}
