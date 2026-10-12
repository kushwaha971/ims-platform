'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { usePathname } from 'next/navigation';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { isMarketingPath } from 'src/routes';

import { fetchSession } from '../redux/sessionThunk';

/** QA B47 — a tab back from this long idle re-reads the session before anything else. */
export const IDLE_RECHECK_MS = 5 * 60 * 1000;

/**
 * Part 19 §19.7.2 — step 1 of the bootstrap sequence, mounted once by the root
 * layout. A 401 here is answered by the transport layer's single silent refresh
 * (§19.4.3); if that fails the session lands on `anonymous` and the `(app)`
 * guard takes over.
 *
 * QA B47 / B21 (12 Oct 2026) — it fetches ONCE per document, on the first path
 * that is not marketing content, and never aborts on navigation. It had been
 * keyed on the pathname, so every route change sent another `GET /auth/me` and
 * aborted the one before; an abort that landed while that request waited on the
 * shared refresh made its replay fail, which the transport read as "the refresh
 * failed" and answered by signing a valid session out to /login. The network
 * showed exactly that: me 401 → refresh 200 → me 200, after the redirect.
 *
 * A tab that comes back after `IDLE_RECHECK_MS` re-reads the session silently
 * (the status stays `authenticated` while it does), so an expired access token
 * is refreshed before the merchant's first tap rather than by it.
 */
export function SessionBootstrap({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const started = useRef(false);

  useEffect(() => {
    // Public acquisition content must render even when the API is unavailable.
    if (started.current || isMarketingPath(pathname)) return;
    started.current = true;
    void dispatch(fetchSession());
  }, [dispatch, pathname]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || !started.current) return;
      // Skipped by the thunk's own condition unless a held session is that stale.
      void dispatch(fetchSession({ ifIdleFor: IDLE_RECHECK_MS }));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [dispatch]);

  return <>{children}</>;
}
