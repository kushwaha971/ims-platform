'use client';

import { useCallback, useMemo } from 'react';

import { localeChanged, selectLocale } from 'src/redux/slice/localeSlice';
import { LOCALES, type Locale } from 'src/types/domain.types';
import { LOCALE_COOKIE, writeCookie } from 'src/utils/cookieUtils';

import { useAppDispatch, useAppSelector } from './useAppStore';

/**
 * Each language named in its OWN script — "English", "हिन्दी" — because the only
 * label a person who needs the control can read is the one in their language.
 */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = { en: 'English', hi: 'हिन्दी' };

export interface UseLocaleSwitchResult {
  readonly locale: Locale;
  readonly options: readonly { readonly value: Locale; readonly label: string }[];
  /** Anything not a known locale falls back to English rather than throwing. */
  readonly setLocale: (next: string) => void;
}

/**
 * UAT D2 — one way to change the language, shared by every control that does.
 *
 * The sign-in screen's picker was the only one, and the owner removed pickers
 * from that screen; a merchant already inside the app then had no way to switch
 * at all. The account menu carries the switch now, at every width, and it must
 * persist EXACTLY as the picker did — the store (`localeChanged`, which also
 * marks the choice as an override that outranks `/auth/me`) AND the readable
 * `ub_locale` cookie, so the next server-rendered `<html lang>` matches and
 * `PreferencesBootstrap` restores it after a refresh. Two controls writing the
 * preference two ways is how the cookie and the store disagreed once before
 * (see `localeSlice`), so both go through here.
 */
export const useLocaleSwitch = (): UseLocaleSwitchResult => {
  const dispatch = useAppDispatch();
  const locale = useAppSelector(selectLocale);

  const setLocale = useCallback(
    (next: string) => {
      const value = (LOCALES as readonly string[]).includes(next) ? (next as Locale) : 'en';
      dispatch(localeChanged(value));
      writeCookie(LOCALE_COOKIE, value);
    },
    [dispatch]
  );

  const options = useMemo(
    () => LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] })),
    []
  );

  return useMemo(() => ({ locale, options, setLocale }), [locale, options, setLocale]);
};
