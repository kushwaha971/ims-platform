/**
 * Part 19 §19.7.1 — `ub_access` and `ub_refresh` are httpOnly and JavaScript
 * never reads them. The only cookies this module touches are the readable ones:
 * the CSRF double-submit token, the locale and the theme (both readable so the
 * server-rendered shell matches and there is no flash).
 */
import Cookies from 'js-cookie';

export const CSRF_COOKIE = 'ub_csrf';
export const LOCALE_COOKIE = 'ub_locale';
export const THEME_COOKIE = 'ub_theme';

export const readCsrfToken = (): string | undefined => Cookies.get(CSRF_COOKIE);

export const readCookie = (name: string): string | undefined => Cookies.get(name);

export const writeCookie = (name: string, value: string, days = 365): void => {
  Cookies.set(name, value, { expires: days, sameSite: 'lax', path: '/' });
};

export const clearCookie = (name: string): void => Cookies.remove(name, { path: '/' });
