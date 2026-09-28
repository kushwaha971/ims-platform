'use client';

import { useCallback, useEffect } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { resetAllFeatureState } from 'src/redux/actions';
import { localeFromProfile } from 'src/redux/slice/localeSlice';
import { selectSessionHeldInThisDocument } from 'src/redux/slice/sessionSlice';
import { replaceDocument } from 'src/utils/documentNavigation';

import { AUTH_CONFIG } from '../config';
import { authResultConsumed, selectAuthResult } from '../redux/authSlice';
import { fetchSession } from '../redux/sessionThunk';
import { postAuthDestination, safeNextPath } from '../view-model/authDisplay';

import type { PostAuthDestination } from '../types/auth.types';

/**
 * Part 19 §19.1.1 layer 4 — the single place a successful authentication turns
 * into a navigation.
 *
 * It exists as one hook, mounted by every auth screen, rather than as a
 * `router.push` at the end of each submit handler, because PLT-01 FR-9's rule
 * has five outcomes and three screens can produce a session (sign-up, password
 * login, reset confirm — CR-2026-09-19-A changed which three, not how many).
 * Three copies of a five-branch rule is three chances to send a CA with sixty
 * clients to a dashboard that does not exist.
 *
 * Order matters and is §19.6.5's:
 *   1. teardown — nothing from a previous session or tenant survives a login;
 *   2. rehydrate `sessionSlice` from `/auth/me`, so the guard sees the truth;
 *   3. navigate, and only then mark the result consumed.
 *
 * ── N1-P1: a sign-in after an earlier session in this runtime reloads ───────
 *
 * The FIRST session in a document ends in `router.replace` — no reload, the
 * common case (a fresh load of /login). Any LATER one — after the cookies
 * expired under a running app, after sign-out, after a signed-in user opened
 * /login — ends in a document load (`replaceDocument`), and it has to:
 *
 * Next's client router caches a route's TREE and CANONICAL URL for five
 * minutes (the static stale time), and it learns both from whatever answered
 * the RSC request — including `proxy.ts`'s cookie-presence redirect. Once the
 * cookies are gone, any RSC request for an `(app)` route answers 307 →
 * `/login?next=…`, and the router records "this route IS the login page" in two
 * ways, both seen on the wire:
 *
 *  · a navigation to a route it had not met yet (on a phone the drawer's links
 *    are never on screen, so `/parties` usually is one) is written into the
 *    route cache with the redirect as its canonical URL;
 *  · a navigation to a route it HAD met is corrected, which invalidates the
 *    route cache and re-prefetches every visible link — and on a phone the
 *    visible link is the header logo, `/dashboard`, re-prefetched while the
 *    cookies are gone and cached as the redirect.
 *
 * After the sign-in, `router.replace('/dashboard')` then resolves from that
 * cache to `/login?next=/dashboard` without a request, and the screen never
 * leaves /login until a hard reload or five minutes pass. `router.refresh()`
 * does not help: it drops cached segment DATA and keeps the route cache, by
 * design. Next exposes no way to drop the route cache, and the poisoned
 * entries are not only the destination — the logo is one tap away. A new
 * document is the one thing that discards all of it. It also discards the
 * previous user's heap on a shared counter PC, which is no loss.
 *
 * So on that path the session is NOT fetched here: the new document's
 * `SessionBootstrap` reads `/auth/me` itself.
 */
export interface UseAuthRedirectResult {
  /** Route on a result the caller already has, without waiting for the slice. */
  readonly redirectTo: (destination: PostAuthDestination) => void;
  /** `?next=` from the URL, already validated against the allow-list. */
  readonly nextPath: string;
}

export const useAuthRedirect = (): UseAuthRedirectResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const result = useAppSelector(selectAuthResult);
  const heldBefore = useAppSelector(selectSessionHeldInThisDocument);

  const nextPath = safeNextPath(searchParams.get('next'), AUTH_CONFIG.defaultPostLoginPath);

  /**
   * CR-2026-09-19-E — the destinations are read off `AUTH_CONFIG` rather than
   * named here, which is the shape BrandHub's `postLoginRoute.ts` has: it takes
   * a `CustomerAuthConfig` and routes to `config.checkoutRoute`,
   * `config.ordersBasePath` and `config.dashboardRoute` without knowing a
   * single path. This function is this product's `postLoginRoute.ts`; it keeps
   * living in the hook because the five-branch rule of PLT-01 FR-9 is mounted
   * by every auth screen and there is one flow, not two portals.
   */
  const redirectTo = useCallback(
    (destination: PostAuthDestination) => {
      const path = destinationPath(destination, nextPath);
      if (heldBefore) replaceDocument(path);
      else router.replace(path);
    },
    [router, nextPath, heldBefore]
  );

  useEffect(() => {
    if (!result) return;

    // CR-2026-09-19-A: there is one way in, so there is no "which tab worked"
    // preference left to write here. The remembered ADDRESS is written by the
    // screen that collected it, because only that screen knows whether the
    // "remember me" tick was left on.

    // PLT-04 BR-5 — locale follows the USER, not the tenant.
    dispatch(localeFromProfile(result.locale));
    // §19.6.5 step 1 — a login is a new dataset; nothing before it survives.
    dispatch(resetAllFeatureState());
    // §19.7.2 — the guard reads `sessionSlice`, so it must be true before we
    // go. Not on the document-load path (N1-P1, above): the next document
    // bootstraps its own session, and this request would only be cancelled.
    if (!heldBefore) void dispatch(fetchSession());

    redirectTo(postAuthDestination(result));
    dispatch(authResultConsumed());
  }, [result, dispatch, redirectTo, heldBefore]);

  return { redirectTo, nextPath };
};

/**
 * PLT-01 FR-9's five outcomes as a path. Pure, so the client navigation and the
 * document load cannot disagree about where a sign-in goes; `nextPath` is
 * already `safeNextPath`'s output.
 */
const destinationPath = (destination: PostAuthDestination, nextPath: string): string => {
  switch (destination.kind) {
    // DEC-012 — first, and it does not honour `?next=`: wherever they were
    // going, the server will refuse it until this is done.
    case 'setPassword':
      return AUTH_CONFIG.setPasswordRoute;
    case 'onboarding':
      return AUTH_CONFIG.onboardingStepPath(destination.step);
    case 'invitation':
    case 'chooser':
      return AUTH_CONFIG.chooserRoute;
    case 'app':
      return nextPath;
    default:
      return AUTH_CONFIG.defaultPostLoginPath;
  }
};
