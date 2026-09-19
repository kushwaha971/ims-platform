import { ROUTES, onboardingStepPath } from 'src/routes';

import { DEFAULT_POST_LOGIN_PATH } from './constants/authDefaults';

/**
 * CR-2026-09-19-E — the auth feature's route map, the one file BrandHub's
 * Customer auth folder has that this one did not.
 *
 * BrandHub's `src/modules/Customer/features/auth/config.ts` declares a
 * `CustomerAuthConfig` interface — `loginRoute`, `forgotPasswordRoute`,
 * `resetPasswordRoute`, `setPasswordRoute`, `dashboardRoute`, … — and exports a
 * `CUSTOMER_AUTH_CONFIG` record of it, which every screen and
 * `postLoginRoute.ts` take as a prop rather than naming routes themselves.
 * Theirs is keyed by portal variant (`primary` / `secondary`), because BrandHub
 * runs two customer portals off one codebase; this product runs one, so the
 * export is a single frozen object rather than a record. The SHAPE is theirs —
 * one place that knows where each step of the flow lives — and adopting it is
 * what stops the fourteenth hand-written `/login?next=` appearing.
 *
 * Nothing here is new behaviour. Every value already existed, in `src/routes.ts`
 * and in `constants/authDefaults.ts`; this assembles them into the flow's own
 * view of itself. `src/routes.ts` remains the single source of the ADDRESSES —
 * this file must never spell a path out.
 *
 * What is deliberately NOT copied from BrandHub's config:
 *  - `userTypeHeader`. This product has one identity and sends no user-type
 *    header; the active tenant is the token's `tid` claim (R-SEC-3).
 *  - `verifyOtpRoute`. CR-2026-09-19-A removed the OTP flow. It returns with
 *    the backlogged OTP screen and is not carried as a dead route meanwhile.
 *  - `fallbackLogo`. White-labelling here is token-driven (`UbLogo` +
 *    `whiteLabelSlice`), not a per-variant image constant.
 */
export interface AuthFlowConfig {
  readonly loginRoute: string;
  readonly signUpRoute: string;
  readonly forgotPasswordRoute: string;
  readonly resetPasswordRoute: string;
  /** First-time / temporary-password set screen. */
  readonly setPasswordRoute: string;
  /** Where an account with more than one business, or an invitation, lands. */
  readonly chooserRoute: string;
  readonly dashboardRoute: string;
  /** PLT-03's wizard; a step number in, a path out. */
  readonly onboardingStepPath: (step: number) => string;
  /** The `?next=` allow-list fallback (§19.6.4 rule 2). */
  readonly defaultPostLoginPath: string;
}

export const AUTH_CONFIG: AuthFlowConfig = Object.freeze({
  loginRoute: ROUTES.LOGIN,
  signUpRoute: ROUTES.SIGNUP,
  forgotPasswordRoute: ROUTES.FORGOT_PASSWORD,
  resetPasswordRoute: ROUTES.RESET_PASSWORD,
  setPasswordRoute: ROUTES.SET_PASSWORD,
  chooserRoute: ROUTES.SWITCH_TENANT,
  dashboardRoute: ROUTES.DASHBOARD,
  onboardingStepPath,
  defaultPostLoginPath: DEFAULT_POST_LOGIN_PATH,
});
