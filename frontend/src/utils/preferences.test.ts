/**
 * Reading the preferences back — the half that did not exist.
 *
 * `readCookie()` was in the codebase with zero callers, so the locale cookie was
 * written on every change and read by nobody: the language reset to English on
 * every refresh while `<html lang>` stayed correct, because the server read the
 * cookie and the client never did.
 */
import Cookies from 'js-cookie';

import { LOCALE_COOKIE, THEME_CHOICE_COOKIE } from './cookieUtils';
import { readLocalePreference, readThemePreference } from './preferences';

describe('preference restore', () => {
  afterEach(() => {
    Cookies.remove(LOCALE_COOKIE, { path: '/' });
    Cookies.remove(THEME_CHOICE_COOKIE, { path: '/' });
  });

  it('returns null when nothing was ever chosen, which means the defaults stand', () => {
    expect(readLocalePreference()).toBeNull();
    expect(readThemePreference()).toBeNull();
  });

  it('reads back a locale the user chose', () => {
    Cookies.set(LOCALE_COOKIE, 'hi', { path: '/' });
    expect(readLocalePreference()).toBe('hi');
  });

  it('reads back a theme the user chose', () => {
    Cookies.set(THEME_CHOICE_COOKIE, 'dark', { path: '/' });
    expect(readThemePreference()).toBe('dark');
  });

  it('ignores a cookie value outside the closed set', () => {
    // A cookie is untrusted input: it is user-editable and survives a deploy that
    // renames a locale. Anything unrecognised must fall back, not propagate.
    Cookies.set(LOCALE_COOKIE, 'fr', { path: '/' });
    Cookies.set(THEME_CHOICE_COOKIE, 'sepia', { path: '/' });
    expect(readLocalePreference()).toBeNull();
    expect(readThemePreference()).toBeNull();
  });

  it('ignores the retired ub_theme cookie', () => {
    // `ub_theme` recorded an OS *observation*, written unconditionally for a
    // year, so a value there is not a choice. Reading it would reinstate the bug
    // for every merchant who already has one.
    Cookies.set('ub_theme', 'dark', { path: '/' });
    expect(readThemePreference()).toBeNull();
    Cookies.remove('ub_theme', { path: '/' });
  });
});
