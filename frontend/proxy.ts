import { NextResponse, type NextRequest } from 'next/server';

import { GUARDED_ROUTE_PREFIXES, RETIRED_ROUTES, ROUTES } from 'src/routes';

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

  // GUARDED, not APP: onboarding needs a session and must NOT need a tenant, so
  // it is guarded here and deliberately absent from the app list that
  // `RequireSession` uses to bounce a tenantless session. It used to be in
  // neither, which is how an anonymous visitor could fill the whole wizard and
  // only discover the problem when `POST /tenants` answered 401.
  if (!GUARDED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has('ub_access') || request.cookies.has('ub_refresh');
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = ROUTES.LOGIN;
  url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|icons|fonts|favicon.ico|manifest.webmanifest|sw.js).*)'],
};
