'use client';

import { useEffect, type ReactNode } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectThemeMode, systemThemeObserved } from 'src/redux/slice/themeSlice';
import { THEME_COOKIE, writeCookie } from 'src/utils/cookieUtils';

/**
 * Part 19 §19.8.4 — `data-theme` on <html>, initialised from a cookie (so the
 * server-rendered shell matches and there is no flash) and falling back to
 * `prefers-color-scheme`. The tokens change underneath, so almost no component
 * needs a `dark:` variant.
 *
 * The blocking inline script that prevents a flash lives in `app/layout.tsx`;
 * this provider owns the state after hydration.
 */
export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const dispatch = useAppDispatch();
  const mode = useAppSelector(selectThemeMode);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => {
      dispatch(systemThemeObserved(event.matches ? 'dark' : 'light'));
    };
    dispatch(systemThemeObserved(query.matches ? 'dark' : 'light'));
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    writeCookie(THEME_COOKIE, mode);
  }, [mode]);

  return <>{children}</>;
}
