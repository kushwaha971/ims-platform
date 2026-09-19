'use client';

import { useEffect, type ReactNode } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';

import { fetchSession } from '../redux/sessionThunk';

/**
 * Part 19 §19.7.2 — step 1 of the bootstrap sequence, mounted once by the root
 * layout. A 401 here is answered by the transport layer's single silent refresh
 * (§19.4.3); if that fails the session lands on `anonymous` and the `(app)`
 * guard takes over.
 */
export function SessionBootstrap({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const promise = dispatch(fetchSession());
    return () => promise.abort();
  }, [dispatch]);

  return <>{children}</>;
}
