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
 * `middleware.ts` is the guard in front of them, and `sidebarConfig.ts` is the
 * menu that links to them — all three name the same constants.
 */

export const ROUTES = {
  // ── (auth) ────────────────────────────────────────────────────────────────
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  SET_PASSWORD: '/set-password',
  ONBOARDING: '/onboarding',

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
 * Part 19 §19.7.3 — the path prefixes `middleware.ts` guards. Derived from
 * `ROUTES` where it can be, and listing the section roots the menu does not
 * name yet (`/stock`, `/notifications`) so a Sprint-5 screen is guarded the day
 * its route file appears rather than the day someone remembers this list.
 */
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

/**
 * CR-2026-09-19-A — addresses that used to exist. `/otp` was the six-digit code
 * screen; the redirect is what stops a bookmark landing on a 404.
 */
export const RETIRED_ROUTES: Readonly<Record<string, string>> = {
  '/otp': ROUTES.LOGIN,
};
