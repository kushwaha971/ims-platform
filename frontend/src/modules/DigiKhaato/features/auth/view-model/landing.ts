import { ROUTES } from 'src/routes';
import type { Landing } from 'src/types/landing.types';

import { AUTH_CONFIG } from '../config';

/**
 * docs/platform/14 §4.1 — the ONE place a `landing` becomes a path.
 *
 * The server decides where a session goes (`selectors/landing.py`); this only
 * spells each answer as a route, so sign-in, the route guard and both password
 * screens cannot disagree. `nextPath` is `safeNextPath`'s output and is honoured
 * only for `app`: every other kind is something the person must do first, and
 * the server would refuse the page they were heading to until they do.
 */
export const landingRoute = (landing: Landing, nextPath: string): string => {
  switch (landing.kind) {
    case 'set_password':
      return AUTH_CONFIG.setPasswordRoute;
    case 'choose_business':
    case 'invitation':
      return AUTH_CONFIG.chooserRoute;
    case 'admin':
      return ROUTES.ADMIN_TENANTS;
    case 'no_business':
      return AUTH_CONFIG.onboardingStepPath(1);
    case 'business_setup':
      return AUTH_CONFIG.onboardingStepPath(landing.step);
    case 'app':
      // `?next=` wins when it named a page; otherwise the app they were in.
      return nextPath === AUTH_CONFIG.defaultPostLoginPath && landing.path
        ? landing.path
        : nextPath;
    default:
      return AUTH_CONFIG.defaultPostLoginPath;
  }
};

/** Kinds that leave no business to show: the guard must not render the app page. */
export const isTenantless = (landing: Landing): boolean =>
  landing.kind === 'choose_business' ||
  landing.kind === 'invitation' ||
  landing.kind === 'admin' ||
  landing.kind === 'no_business';
