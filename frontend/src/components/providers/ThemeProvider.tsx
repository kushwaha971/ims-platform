'use client';

import { useEffect, type ReactNode } from 'react';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectThemeIsExplicit, selectThemeMode } from 'src/redux/slice/themeSlice';
import { THEME_CHOICE_COOKIE, writeCookie } from 'src/utils/cookieUtils';

/**
 * Part 19 §19.8.4 — keeps `data-theme` on <html> in step with the slice.
 *
 * It used to do two more things, and both were the theme bug:
 *
 *  1. It dispatched `systemThemeObserved` on mount and on every
 *     `prefers-color-scheme` change, which made the operating system
 *     authoritative — see `themeSlice` for why that cannot coexist with "light is
 *     the default". The media query is no longer consulted.
 *  2. It wrote the cookie unconditionally, so an OS-derived value was persisted
 *     for a year as if the merchant had chosen it. The cookie is now written only
 *     when `explicit` is true, which only `themeChanged` and `themeRestored` set.
 *
 * The blocking script in `app/layout.tsx` still resolves the attribute before
 * first paint; this owns it after hydration.
 */
export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const mode = useAppSelector(selectThemeMode);
  const explicit = useAppSelector(selectThemeIsExplicit);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    if (explicit) writeCookie(THEME_CHOICE_COOKIE, mode);
  }, [mode, explicit]);

  return <>{children}</>;
}
