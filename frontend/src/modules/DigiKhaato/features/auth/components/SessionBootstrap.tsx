'use client';

import { useEffect, type ReactNode } from 'react';

import { usePathname } from 'next/navigation';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { isMarketingPath } from 'src/routes';


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
  const pathname = usePathname();

  useEffect(() => {
    // Public acquisition content must render even when the API is unavailable.
    if (isMarketingPath(pathname)) return;
    const promise = dispatch(fetchSession());
    return () => promise.abort();
  }, [dispatch, pathname]);

  return <>{children}</>;
}
