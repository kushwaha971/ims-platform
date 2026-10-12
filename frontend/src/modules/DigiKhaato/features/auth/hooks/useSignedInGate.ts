import { useEffect, useRef, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectLanding, selectSessionStatus } from 'src/redux/slice/sessionSlice';

import { AUTH_CONFIG } from '../config';
import { selectAuthStatus, selectOtp } from '../redux/authSlice';
import { fetchSession } from '../redux/sessionThunk';
import { safeNextPath } from '../view-model/authDisplay';
import { landingRoute } from '../view-model/landing';

/**
 * QA B48 / B49 (12 Oct 2026) — `/login` and `/signup` opened while signed in drew
 * the form, so a merchant could ask for a code or start a second account over a
 * live session; and a hard load painted the sign-in screen before the app.
 *
 * The screen now asks the SERVER first and draws nothing but a neutral skeleton
 * while it does (`checking`):
 *  - a bootstrap in flight (a hard load) is waited for;
 *  - a session the store already holds (an in-app visit) is re-read, because a
 *    session summary can outlive its cookies (NEW-1) — a refused re-read ends
 *    through the transport's `onSessionExpired`, which tears it down as logout
 *    does, and the form appears;
 *  - a live session goes to the validated `next`, else the session's landing.
 * Once the form is shown the gate stands down, so a sign-in made ON this screen
 * is routed by `useAuthRedirect` alone.
 */
export const useSignedInGate = (): { readonly checking: boolean } => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useAppSelector(selectSessionStatus);
  const landing = useAppSelector(selectLanding);
  // The merchant has started signing in here: the gate's question is answered.
  const otp = useAppSelector(selectOtp);
  const authStatus = useAppSelector(selectAuthStatus);
  const started = otp !== null || authStatus !== 'idle';
  const [heldAtMount] = useState(status === 'authenticated' || status === 'no_tenant');
  // `null` while the re-read of a held session is outstanding.
  const [reread, setReread] = useState<'ok' | 'refused' | null>(null);
  const left = useRef(false);

  useEffect(() => {
    if (!heldAtMount) return;
    void dispatch(fetchSession()).then((result) => {
      setReread(fetchSession.fulfilled.match(result) ? 'ok' : 'refused');
    });
  }, [dispatch, heldAtMount]);

  const live = status === 'authenticated' || status === 'no_tenant';
  const goIn = !started && live && (!heldAtMount || reread === 'ok');
  const waiting = heldAtMount ? reread === null : status === 'idle' || status === 'loading';

  useEffect(() => {
    if (!goIn || left.current) return;
    left.current = true;
    const next = safeNextPath(searchParams.get('next'), AUTH_CONFIG.defaultPostLoginPath);
    router.replace(landingRoute(landing, next));
  }, [goIn, landing, router, searchParams]);

  return { checking: !started && (waiting || goIn) };
};
