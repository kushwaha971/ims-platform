/**
 * Part 19 §19.6 — every application path, once.
 *
 * This is BrandHub's `apps/frontend/src/routes.ts` — one module at the root of
 * `src/` whose only job is to be the place a path is written down — with one
 * mechanical difference: BrandHub declares it as `export enum ROUTES { … }`,
 * and R-TS-8 forbids a TypeScript `enum` in this codebase (it emits a runtime
 * object and its members are not assignable from plain strings). The `as const`
 * object below gives the same `ROUTES.LOGIN` call site and a real string union
 * on top of it.
 *
 * Before this file, `'/dashboard'` appeared thirteen times across four features
 * and `'/onboarding/step/' + n` was built in four places from three different
 * expressions. A path that is written twice is a path that gets renamed once.
 *
 * The paths here are the ADDRESSES. `app/` is the file tree that serves them,
 * `proxy.ts` is the guard in front of them, and `sidebarConfig.ts` is the
 * menu that links to them — all three name the same constants.
 */

export const ROUTES = {
  // ── (auth) ────────────────────────────────────────────────────────────────
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  /** PLT-05 FR-10 — where an invitation link lands. */
  ACCEPT_INVITE: '/accept-invite',
  SET_PASSWORD: '/set-password',
  ONBOARDING: '/onboarding',

  // ── (public) — reachable with no session, because the sign-up screen links
  //    to them BEFORE an account exists. CR-2026-09-19-D: "the terms" used to
  //    be four words of prose with nothing behind them.
  LEGAL_TERMS: '/legal/terms',
  LEGAL_PRIVACY: '/legal/privacy',

  // ── (app) ─────────────────────────────────────────────────────────────────
  DASHBOARD: '/dashboard',
  PARTIES: '/parties',
  LEDGER_REMINDERS: '/ledger/reminders',
  ITEMS: '/items',
  SALES_INVOICES: '/sales/invoices',
  PURCHASE_BILLS: '/purchases/bills',
  PAYMENTS: '/payments',
  EXPENSES: '/expenses',
  REPORTS: '/reports',
  SETTINGS: '/settings',
  SETTINGS_PLAN: '/settings/plan',
  SETTINGS_TEAM: '/settings/team',
  SWITCH_TENANT: '/switch',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[RouteKey];

/**
 * PLT-03 FR-9 — the wizard's step address. The step number is 1-based and the
 * wizard is four steps (§32.4.7's risk row is about it staying four), so this
 * clamps rather than trusting a number that came back from the server.
 */
export const ONBOARDING_STEP_MIN = 1;
export const ONBOARDING_STEP_MAX = 4;

export const onboardingStepPath = (step: number): string => {
  const clamped = Math.min(ONBOARDING_STEP_MAX, Math.max(ONBOARDING_STEP_MIN, Math.trunc(step)));
  return `${ROUTES.ONBOARDING}/step/${clamped}`;
};

/**
 * §19.6.4 rule 2 — the login address carrying where the user was going. The
 * `next` value is validated on the way OUT by `safeNextPath()`; encoding it on
 * the way in is this function's whole job, and doing it in one place is what
 * stops one call site forgetting `encodeURIComponent`.
 */
export const loginPathWithNext = (next: string): string =>
  `${ROUTES.LOGIN}?next=${encodeURIComponent(next)}`;

/**
 * Part 19 §19.7.3 — the path prefixes `proxy.ts` guards. Derived from
 * `ROUTES` where it can be, and listing the section roots the menu does not
 * name yet (`/stock`, `/notifications`) so a Sprint-5 screen is guarded the day
 * its route file appears rather than the day someone remembers this list.
 */
/**
 * Paths that need a SESSION but must not need a tenant.
 *
 * The onboarding wizard is the whole of this category and it was guarded by
 * nothing: not in `APP_ROUTE_PREFIXES`, so `proxy.ts` waved it through, and
 * `app/(auth)/layout.tsx` mounts no `RequireSession`. An anonymous visitor could
 * load and fill every step; it only failed at `POST /tenants`, with a 401 after
 * the work rather than a redirect before it.
 *
 * It cannot simply join `APP_ROUTE_PREFIXES`, because those are the routes
 * `RequireSession` sends a tenantless session AWAY from — putting onboarding
 * among them would bounce the very people it exists for. Hence a second list:
 * the proxy guards both, and only the app list implies a tenant.
 */
export const SESSION_ONLY_ROUTE_PREFIXES: readonly string[] = [
  ROUTES.ONBOARDING,
  // Accepting an invitation needs a session — it is how the server knows WHOSE
  // membership to create, and the token is checked against the signed-in
  // address. It must NOT need a tenant: an invitee with no business of their own
  // is the ordinary case, and the app list would bounce them away from the very
  // link that would give them one.
  ROUTES.ACCEPT_INVITE,
];


export const APP_ROUTE_PREFIXES: readonly string[] = [
  ROUTES.DASHBOARD,
  ROUTES.PARTIES,
  '/ledger',
  ROUTES.ITEMS,
  '/stock',
  '/sales',
  '/purchases',
  ROUTES.PAYMENTS,
  ROUTES.EXPENSES,
  ROUTES.REPORTS,
  ROUTES.SETTINGS,
  ROUTES.SWITCH_TENANT,
  '/notifications',
];

/** Everything the proxy guards: a session is required for all of it. */
export const GUARDED_ROUTE_PREFIXES: readonly string[] = [
  ...SESSION_ONLY_ROUTE_PREFIXES,
  ...APP_ROUTE_PREFIXES,
];

/**
 * The addresses that do NOT require a session — the auth flow's own screens.
 *
 * Needed because "send an unauthenticated caller to login" is only correct when
 * the caller is not already there. `SessionBootstrap` calls `GET /auth/me` from
 * the root layout, so it runs on `/login` too and answers 401 for the ordinary
 * reason that nobody has signed in yet. Without this list the 401 handler
 * redirected `/login` to `/login?next=/login`, which is a full page load, which
 * re-runs the bootstrap, which 401s again — an unbounded loop that re-encodes
 * `next` each time, so the address doubles in length on every pass. The login
 * form never settled long enough to type into.
 *
 * `isPublicPath` matches on prefix because `/reset-password` carries a token
 * segment, and it is exported from here for the same reason every other address
 * is: so there is one list, not one per guard.
 */
export const PUBLIC_ROUTE_PREFIXES: readonly string[] = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.RESET_PASSWORD,
  ROUTES.SET_PASSWORD,
];

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

/**
 * CR-2026-09-19-A — addresses that used to exist. `/otp` was the six-digit code
 * screen; the redirect is what stops a bookmark landing on a 404.
 */
export const RETIRED_ROUTES: Readonly<Record<string, string>> = {
  '/otp': ROUTES.LOGIN,
};
