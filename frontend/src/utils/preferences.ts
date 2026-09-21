/**
 * Reading the preferences back — the half that was missing.
 *
 * `LanguagePicker` wrote `ub_locale` and `ThemeProvider` wrote the theme cookie,
 * and **nothing ever read either one into the store.** `readCookie()` existed and
 * was called from nowhere. So the language reset to English on every refresh
 * while `<html lang>` stayed correct, because the server read the cookie and the
 * client never did — the two halves of the same preference disagreeing on every
 * page load.
 *
 * This module is the read side, for both preferences, in one place. The write
 * side stays where it is; what did not exist was anything that closed the loop.
 */
import { DEFAULT_LOCALE } from 'src/constants';
import { LOCALES, type Locale, type ThemeMode } from 'src/types/domain.types';
import { LOCALE_COOKIE, THEME_CHOICE_COOKIE, readCookie } from 'src/utils/cookieUtils';

/** A cookie is untrusted input: anything not in the closed set is ignored. */
export const readLocalePreference = (): Locale | null => {
  const raw = readCookie(LOCALE_COOKIE);
  return raw && (LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : null;
};

/**
 * The theme the user *chose*, or null if they never chose one.
 *
 * Null is the common case and means light — see `themeSlice`. It does not mean
 * "ask the operating system", which is the behaviour this replaces.
 */
export const readThemePreference = (): ThemeMode | null => {
  const raw = readCookie(THEME_CHOICE_COOKIE);
  return raw === 'dark' || raw === 'light' ? raw : null;
};

export const DEFAULT_LOCALE_FALLBACK: Locale = DEFAULT_LOCALE;
