'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useLocaleSwitch } from 'src/hooks/useLocaleSwitch';
import { selectImpersonation, selectSessionUser } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { logout } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

/**
 * What a person can do about their own account — who is signed in, the
 * language, Sign out — for the two places that offer it: the desktop bar's
 * account menu and the phone's More tab. One hook, so Sign out logs out and
 * routes the same way from both, and the language is persisted by the one
 * `useLocaleSwitch` there is.
 */
export interface AccountActions {
  readonly user: ReturnType<typeof selectSessionUser>;
  readonly impersonating: boolean;
  readonly locale: ReturnType<typeof useLocaleSwitch>['locale'];
  readonly options: ReturnType<typeof useLocaleSwitch>['options'];
  readonly setLocale: ReturnType<typeof useLocaleSwitch>['setLocale'];
  readonly signOut: () => Promise<void>;
}

export function useAccountActions(): AccountActions {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectSessionUser);
  const impersonating = useAppSelector(selectImpersonation) !== null;
  const { locale, options, setLocale } = useLocaleSwitch();

  const signOut = useCallback(async () => {
    await dispatch(logout());
    router.replace(ROUTES.LOGIN);
  }, [dispatch, router]);

  return { user, impersonating, locale, options, setLocale, signOut };
}
