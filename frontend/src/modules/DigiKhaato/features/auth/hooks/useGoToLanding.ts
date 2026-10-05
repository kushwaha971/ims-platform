'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { useStore } from 'react-redux';

import { selectLanding } from 'src/redux/slice/sessionSlice';
import type { RootState } from 'src/redux/store';
import { ROUTES } from 'src/routes';

import { landingRoute } from '../view-model/landing';

/**
 * docs/platform/14 §4.1 — "carry on to wherever this session belongs", for a
 * screen that has just changed the session (a chosen password, a finished
 * step). It reads the store when CALLED rather than when the screen rendered,
 * because the caller has just re-read `/auth/me` and the landing it rendered
 * with is the one before that change.
 *
 * The two password screens used to hard-code where to go: one sent everyone to
 * onboarding step 1, the other to the Shop dashboard. Both now go where the
 * server says.
 */
export const useGoToLanding = (): (() => void) => {
  const router = useRouter();
  const store = useStore<RootState>();
  return useCallback(() => {
    router.replace(landingRoute(selectLanding(store.getState()), ROUTES.DASHBOARD));
  }, [router, store]);
};
