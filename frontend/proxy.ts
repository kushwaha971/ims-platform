import { NextResponse, type NextRequest } from 'next/server';

import { GUARDED_ROUTE_PREFIXES, RETIRED_ROUTES, ROUTES } from 'src/routes';
import { hasSessionCookie } from 'src/utils/sessionCookies';

/**
 * Part 19 §19.7.3 — the cheap half of the guard. A cookie-PRESENCE check on
 * `(app)` paths, so an unauthenticated deep link does not download and boot the
 * whole application before redirecting. It never decodes or validates the
 * token: that is the server's job, and `<RequireSession>` does the real check.
 */

/**
 * CR-2026-09-19-A — routes that USED to exist and now do not, and the prefixes
 * this guard covers, both from `src/routes.ts`. They used to be two literal
 * arrays here, which is how a new section ends up guarded in the menu and not
 * in the proxy.
 *
 * The retirement is a redirect and not a rewrite: the address bar must end up
 * saying `/login`, or the same back gesture repeats forever.
 */

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const retired = RETIRED_ROUTES[pathname];
  if (retired) {
    const url = request.nextUrl.clone();
    url.pathname = retired;
    // The query string goes nowhere: it belonged to a flow that no longer runs.
    url.search = '';
    return NextResponse.redirect(url);
  }

  const hasSession = hasSessionCookie((name) => request.cookies.has(name));

  // The front door. A visitor with no session gets the landing page; a browser
  // carrying one goes straight to its book, as `/` always did. It is decided
  // HERE, beside the guard, so the rule "a session cookie means the app" lives
  // in one place (§19.7.3) — `app/page.tsx` renders the landing page and knows
  // nothing about sessions. A stale cookie is not a problem this check has to
  // solve: `/dashboard` is guarded, `<RequireSession>` asks the server, and an
  // expired session ends on `/login` the ordinary way.
  if (pathname === ROUTES.HOME) {
    if (!hasSession) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.DASHBOARD;
    // A campaign's `?utm_…` belongs to the landing page, not to the book.
    url.search = '';
    return NextResponse.redirect(url);
  }

  // GUARDED, not APP: onboarding needs a session and must NOT need a tenant, so
  // it is guarded here and deliberately absent from the app list that
  // `RequireSession` uses to bounce a tenantless session. It used to be in
  // neither, which is how an anonymous visitor could fill the whole wizard and
  // only discover the problem when `POST /tenants` answered 401.
  if (!GUARDED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = ROUTES.LOGIN;
  url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // `brand` (CR-2026-09-29-BRAND-A): the SVG favicon lives in `public/brand/`,
  // and a signed-out tab asking for it must get the file, not a redirect to
  // /login — the sign-in page's own tab icon would otherwise be blank.
  //
  // `media`: the landing page's loops and posters. Public files that a video
  // element fetches with Range requests, often dozens of them — none of them
  // is an address this guard has anything to say about.
  matcher: ['/((?!_next|api|icons|brand|fonts|media|favicon.ico|manifest.webmanifest|sw.js).*)'],
};
