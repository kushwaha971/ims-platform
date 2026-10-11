'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useLocaleSwitch } from 'src/hooks/useLocaleSwitch';
import { selectImpersonation, selectSessionUser } from 'src/redux/slice/sessionSlice';
import { selectThemeMode, themeChanged } from 'src/redux/slice/themeSlice';
import { ROUTES } from 'src/routes';
import type { ThemeMode } from 'src/types/domain.types';

import { logout } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

/**
 * What a person can do about their own account — who is signed in, the
 * language, Sign out — for the two places that offer it: the desktop bar's
 * account menu and the phone's More tab. One hook, so Sign out logs out and
 * routes the same way from both, and the language is persisted by the one
 * `useLocaleSwitch` there is.
 *
 * The THEME is here too (owner, 12 Oct 2026). Until then nothing inside the
 * signed-in app could change it, on a phone or a desktop: the only control was
 * on the public landing page, and a comment in `AuthShell` said it "still
 * lives in settings", where it had never been. `ThemeProvider` persists the
 * choice and the root layout applies it before paint, so this only dispatches.
 */
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark'];

export interface AccountActions {
  readonly user: ReturnType<typeof selectSessionUser>;
  readonly impersonating: boolean;
  readonly locale: ReturnType<typeof useLocaleSwitch>['locale'];
  readonly options: ReturnType<typeof useLocaleSwitch>['options'];
  readonly setLocale: ReturnType<typeof useLocaleSwitch>['setLocale'];
  readonly theme: ThemeMode;
  readonly setTheme: (mode: ThemeMode) => void;
  readonly signOut: () => Promise<void>;
}

export function useAccountActions(): AccountActions {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectSessionUser);
  const impersonating = useAppSelector(selectImpersonation) !== null;
  const { locale, options, setLocale } = useLocaleSwitch();
  const theme = useAppSelector(selectThemeMode);
  const setTheme = useCallback((mode: ThemeMode) => dispatch(themeChanged(mode)), [dispatch]);

  const signOut = useCallback(async () => {
    await dispatch(logout());
    router.replace(ROUTES.LOGIN);
  }, [dispatch, router]);

  return { user, impersonating, locale, options, setLocale, theme, setTheme, signOut };
}
