/**
 * @jest-environment node
 *
 * `middleware.ts` runs on the edge runtime and `next/server` reaches for the
 * WHATWG `Request` at import time, which jsdom does not provide. Node 22 does,
 * and this suite touches no DOM, so the node environment is the honest one.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { middleware } from '../../middleware';

/**
 * CR-2026-09-19-A — mobile OTP is backlogged, and `/otp` is retired.
 *
 * "Retired" has to mean two separate things, so there are two kinds of
 * assertion here. First, the route must not EXIST: a `page.tsx` left behind
 * would still render, and a screen wired to a slice that no longer holds a
 * challenge is exactly the broken page this change was meant to avoid. Second,
 * the address must still GO somewhere: a bookmark, a back gesture or a stale
 * service-worker entry is not a bug the merchant caused, and a 404 tells them
 * the product is broken.
 *
 * The file-system half is checked against the real `app/` tree rather than a
 * list, because a list is a thing to forget.
 */
const APP_DIR = join(process.cwd(), 'app');
const AUTH_GROUP = join(APP_DIR, '(auth)');

const request = (pathname: string) => {
  const url = new URL(`https://udhaarbook.test${pathname}`);
  return {
    nextUrl: Object.assign(url, { clone: () => new URL(url.toString()) }),
    cookies: { has: () => false },
  } as unknown as Parameters<typeof middleware>[0];
};

describe('the /otp route is gone', () => {
  it('has no page file anywhere under app/', () => {
    expect(existsSync(join(AUTH_GROUP, 'otp'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'otp'))).toBe(false);
  });

  it('leaves no OTP screen behind in the auth group', () => {
    const routes = readdirSync(AUTH_GROUP, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(routes).not.toContain('otp');
    // The routes CR-2026-09-19-A leaves the product with.
    expect(routes).toEqual(expect.arrayContaining(['login', 'signup', 'forgot-password']));
  });

  it('sends a bookmarked /otp to the login screen rather than to a 404', () => {
    const response = middleware(request('/otp'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/login');
  });

  it('drops the old flow’s query string on the way', () => {
    const response = middleware(request('/otp?challenge=c1'));

    expect(new URL(response.headers.get('location') ?? '').search).toBe('');
  });
});

describe('the routes CR-2026-09-19-A adds are reachable', () => {
  it.each(['/signup', '/reset-password', '/login', '/forgot-password'])(
    'lets %s through the guard unauthenticated',
    (pathname) => {
      const response = middleware(request(pathname));
      // `NextResponse.next()` is a 200 with no Location; a redirect would mean
      // an anonymous user could not reach the screen that creates an account.
      expect(response.headers.get('location')).toBeNull();
    }
  );

  it('still guards an app path for an anonymous visitor', () => {
    const response = middleware(request('/parties'));
    const location = new URL(response.headers.get('location') ?? '');

    expect(location.pathname).toBe('/login');
    expect(location.search).toBe('?next=%2Fparties');
  });
});
