/**
 * @jest-environment node
 *
 * The landing page at `/` (see retiredRoutes.test.ts for why this suite runs in
 * the node environment: `next/server` needs the WHATWG `Request`).
 */

import { ROUTES, isPublicPath } from 'src/routes';
import { SESSION_COOKIES, hasSessionCookie } from 'src/utils/sessionCookies';

import { proxy } from '../../proxy';

const request = (pathname: string, cookies: readonly string[] = []) => {
  const url = new URL(`https://yourkhata.test${pathname}`);
  return {
    nextUrl: Object.assign(url, { clone: () => new URL(url.toString()) }),
    cookies: { has: (name: string) => cookies.includes(name) },
  } as unknown as Parameters<typeof proxy>[0];
};

describe('the front door', () => {
  /**
   * `/` used to redirect everybody to `/dashboard`, which bounced a visitor
   * with no account to `/login` — the product had no page that said what it
   * was. Now a signed-out visitor stays on `/`.
   */
  it('shows the landing page to a browser with no session cookie', () => {
    const response = proxy(request('/'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  /**
   * And a merchant who bookmarked the bare domain must still land in their
   * book: either session cookie is enough, as it is for every guarded path.
   */
  it.each(SESSION_COOKIES.map((name) => [name]))(
    'sends a browser carrying %s straight to the dashboard',
    (cookie) => {
      const response = proxy(request('/?utm_source=whatsapp', [cookie]));

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.pathname).toBe(ROUTES.DASHBOARD);
      expect(location.search).toBe('');
    }
  );

  it('still guards the app for a signed-out visitor', () => {
    const response = proxy(request('/dashboard'));

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe(ROUTES.LOGIN);
  });
});

describe('isPublicPath and the root', () => {
  /**
   * `/` is public so the bootstrap's 401 does not send a visitor to login —
   * but as a PREFIX it would make every address public, and the 401 handler
   * would stop redirecting anywhere at all.
   */
  it('matches the root exactly and nothing under it', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/parties/abc')).toBe(false);
    expect(isPublicPath('//evil')).toBe(false);
  });

  it('leaves the other public prefixes working as prefixes', () => {
    expect(isPublicPath('/d/abc123')).toBe(true);
    expect(isPublicPath('/reset-password/token')).toBe(true);
  });
});

describe('hasSessionCookie', () => {
  it('is true for either cookie and false for neither', () => {
    expect(hasSessionCookie((name) => name === 'ub_refresh')).toBe(true);
    expect(hasSessionCookie((name) => name === 'ub_access')).toBe(true);
    expect(hasSessionCookie((name) => name === 'ub_csrf')).toBe(false);
  });
});
