/**
 * Part 19 §19.7.1 — `ub_access` and `ub_refresh` are httpOnly and JavaScript
 * never reads them. The only cookies this module touches are the readable ones:
 * the CSRF double-submit token, the locale and the theme (both readable so the
 * server-rendered shell matches and there is no flash).
 */
import Cookies from 'js-cookie';

export const CSRF_COOKIE = 'ub_csrf';
export const LOCALE_COOKIE = 'ub_locale';
/**
 * The theme the user explicitly chose.
 *
 * Deliberately NOT the old `ub_theme`. That cookie recorded an *observation* —
 * `ThemeProvider` wrote whatever `prefers-color-scheme` reported, unconditionally
 * and for a year, so a value there is indistinguishable from a real choice and
 * most of them were not one. A cookie whose meaning changes needs a new name, or
 * every existing reader inherits the old meaning's bugs. `ub_theme` is now
 * ignored, and a merchant who had dark forced on them by the old behaviour gets
 * light back on their next visit.
 */
export const THEME_CHOICE_COOKIE = 'ub_theme_choice';

/** @deprecated Read by nothing; see THEME_CHOICE_COOKIE. Kept so the server-side
 *  layout read and any stale value are traceable to this note rather than to a
 *  grep that finds nothing. */
export const THEME_COOKIE = 'ub_theme';

export const readCsrfToken = (): string | undefined => Cookies.get(CSRF_COOKIE);

export const readCookie = (name: string): string | undefined => Cookies.get(name);

export const writeCookie = (name: string, value: string, days = 365): void => {
  Cookies.set(name, value, { expires: days, sameSite: 'lax', path: '/' });
};

export const clearCookie = (name: string): void => Cookies.remove(name, { path: '/' });
