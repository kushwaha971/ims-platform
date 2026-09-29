/**
 * Part 19 §19.7.3 — the two cookies whose PRESENCE means "this browser has a
 * session", and the one check that reads them.
 *
 * This module imports nothing, deliberately. `proxy.ts` runs on the edge
 * runtime in front of every request, and the cookie helpers it would otherwise
 * reach for (`cookieUtils`) import `js-cookie`, a browser library that has no
 * business in that bundle. Module-level imports tree-shake between modules,
 * not within one, so the names live here on their own.
 *
 * Presence is all this ever answers. The tokens are httpOnly and nothing on
 * the client or the edge decodes them: the server decides whether a session is
 * valid, and `<RequireSession>` does the real check.
 */
export const SESSION_COOKIES = ['ub_access', 'ub_refresh'] as const;

export type SessionCookieName = (typeof SESSION_COOKIES)[number];

/** `has` is `request.cookies.has` on the edge, or any equivalent lookup. */
export const hasSessionCookie = (has: (name: string) => boolean): boolean =>
  SESSION_COOKIES.some((name) => has(name));
