'use client';

import { useCallback, useEffect } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { resetAllFeatureState } from 'src/redux/actions';
import { localeFromProfile } from 'src/redux/slice/localeSlice';
import { ROUTES, onboardingStepPath } from 'src/routes';

import { DEFAULT_POST_LOGIN_PATH } from '../constants/authDefaults';
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

  const nextPath = safeNextPath(searchParams.get('next'), DEFAULT_POST_LOGIN_PATH);

  const redirectTo = useCallback(
    (destination: PostAuthDestination) => {
      switch (destination.kind) {
        case 'onboarding':
          router.replace(onboardingStepPath(destination.step));
          return;
        case 'setPassword':
          router.replace(ROUTES.SET_PASSWORD);
          return;
        case 'invitation':
        case 'chooser':
          router.replace(ROUTES.SWITCH_TENANT);
          return;
        case 'app':
          router.replace(nextPath);
          return;
        default:
          router.replace(DEFAULT_POST_LOGIN_PATH);
      }
    },
    [router, nextPath]
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
    // §19.7.2 — the guard reads `sessionSlice`, so it must be true before we go.
    void dispatch(fetchSession());

    redirectTo(postAuthDestination(result));
    dispatch(authResultConsumed());
  }, [result, dispatch, redirectTo]);

  return { redirectTo, nextPath };
};
