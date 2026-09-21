'use client';

import { useLayoutEffect, type ReactNode } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { localeRestored } from 'src/redux/slice/localeSlice';
import { themeRestored } from 'src/redux/slice/themeSlice';
import { readLocalePreference, readThemePreference } from 'src/utils/preferences';

/**
 * Restores the merchant's saved preferences into the store, before first paint.
 *
 * Both preferences were written and never read. The language picker wrote
 * `ub_locale`; `localeSlice` started at `DEFAULT_LOCALE` on every load and
 * nothing closed the loop, so a merchant working in Hindi got English back on
 * every refresh while `<html lang="hi">` — read server-side from the same cookie
 * — insisted otherwise. `readCookie()` had existed the whole time with no
 * callers.
 *
 * **Why `useLayoutEffect` and not `useEffect`.** A layout effect runs after
 * hydration but *before* the browser paints, so the restored locale is on screen
 * in the first frame the merchant sees and there is no flash of English. A plain
 * `useEffect` runs after paint, which would show English for a frame — the exact
 * flicker BrandHub's customer portal has, where `initApp()` restores the language
 * in a mount effect and the first paint renders raw translation keys.
 *
 * **Why not `preloadedState`.** That would be better still — no effect at all —
 * but the store is a module singleton (`src/redux/store.ts`) that the transport
 * layer registers against at import time, and cookies are not readable during
 * server render. Restoring after hydration keeps the server and client markup
 * identical, so there is no mismatch to suppress.
 *
 * The theme needs no such care: the blocking script in `app/layout.tsx` has
 * already set `data-theme` from the same cookie before anything renders. This
 * only tells the store what the document already shows, so that
 * `selectThemeMode` agrees with the page and a toggle starts from the right
 * position.
 */
export function PreferencesBootstrap({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const dispatch = useAppDispatch();

  useLayoutEffect(() => {
    const locale = readLocalePreference();
    if (locale) dispatch(localeRestored(locale));

    const theme = readThemePreference();
    if (theme) dispatch(themeRestored(theme));
  }, [dispatch]);

  return <>{children}</>;
}
