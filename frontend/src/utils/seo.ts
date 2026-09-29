import { SITE_URL } from 'src/constants';
import { GUARDED_ROUTE_PREFIXES, ROUTES } from 'src/routes';

import type { Metadata } from 'next';

/**
 * CR-2026-09-29-PLATFORM-C — what search engines may crawl and index, stated
 * once. `app/robots.ts`, `app/sitemap.ts`, the `(app)` / `(admin)` layouts and
 * the auth-flow layouts all read from here, and `seo.test.ts` holds each list
 * to the rule it exists for.
 *
 * The public, indexable surface is small on purpose: the landing page, the two
 * legal pages and the two doors (sign in, sign up). Everything else is either
 * a signed-in screen (nothing to see without a session, and the proxy sends a
 * crawler to /login anyway), a one-time flow (a reset or invitation link, an
 * onboarding step) or a CUSTOMER's document.
 */

/** `https://yourkhata.com` + path. `absoluteUrl('/')` is the canonical home. */
export const absoluteUrl = (path: string): string =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * The robots meta for anything that must never be in an index. `nocache`
 * (noarchive) because a cached copy of a signed-in screen is the same leak as
 * an indexed one.
 */
export const NOINDEX_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};

/** The pages crawlers are invited to. Everything else that is public is a flow. */
export const CRAWL_ALLOW: readonly string[] = [
  ROUTES.HOME,
  // `/legal/terms` and `/legal/privacy`, and any legal page added beside them.
  '/legal/',
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
];

/**
 * The share page's prefix WITH its slash: `Disallow: /d` would also match
 * `/dashboard` and anything else that starts with a d.
 */
export const SHARE_PAGE_PREFIX = `${ROUTES.PUBLIC_DOCUMENT}/`;

/**
 * The one-time flows. Each carries a token or only makes sense mid-journey,
 * and none is a page anybody searches for. Onboarding, accept-invite and admin
 * are already in `GUARDED_ROUTE_PREFIXES` (they need a session); these do not.
 */
const FLOW_PREFIXES: readonly string[] = [
  ROUTES.FORGOT_PASSWORD,
  ROUTES.RESET_PASSWORD,
  ROUTES.SET_PASSWORD,
];

/**
 * Every signed-in prefix comes from `GUARDED_ROUTE_PREFIXES`, so a section
 * added to the app — and therefore to the proxy's guard — is disallowed here
 * without anybody remembering to. `/api/` is the backend; `/design-system` is
 * the internal component gallery.
 */
export const CRAWL_DISALLOW: readonly string[] = [
  ...new Set([
    ...GUARDED_ROUTE_PREFIXES,
    ...FLOW_PREFIXES,
    SHARE_PAGE_PREFIX,
    '/api/',
    '/design-system',
  ]),
];

/** The sitemap, in the order a person would meet them. */
export const SITEMAP_PATHS: readonly string[] = [
  ROUTES.HOME,
  ROUTES.SIGNUP,
  ROUTES.LOGIN,
  ROUTES.LEGAL_TERMS,
  ROUTES.LEGAL_PRIVACY,
];
