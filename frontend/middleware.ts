import { NextResponse, type NextRequest } from 'next/server';

/**
 * Part 19 §19.7.3 — the cheap half of the guard. A cookie-PRESENCE check on
 * `(app)` paths, so an unauthenticated deep link does not download and boot the
 * whole application before redirecting. It never decodes or validates the
 * token: that is the server's job, and `<RequireSession>` does the real check.
 */
const APP_PREFIXES = [
  '/dashboard',
  '/parties',
  '/ledger',
  '/items',
  '/stock',
  '/sales',
  '/purchases',
  '/payments',
  '/expenses',
  '/reports',
  '/settings',
  '/notifications',
];

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (!APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has('ub_access') || request.cookies.has('ub_refresh');
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|icons|fonts|favicon.ico|manifest.webmanifest|sw.js).*)'],
};
