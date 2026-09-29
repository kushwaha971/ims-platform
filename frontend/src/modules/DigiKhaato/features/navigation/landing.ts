import { ROUTES } from 'src/routes';

import type { NavSectionView } from './useNavigation';

/**
 * R49 / A16 — where a member lands after signing in: the dashboard if they
 * hold `reports.basic.read`, else the first navigation item they can see.
 *
 * That rule needs no branch of its own, because it IS the navigation's order:
 * the dashboard row is the first item of the first section and is gated on
 * exactly `reports.basic.read` with the reports module on. So the landing is
 * the first visible item, whatever it is — Customers for a counter clerk, Bills
 * for a billing-only login, a lending agent's route list once lending ships.
 *
 * A member who can see nothing at all is sent to Customers, which is where the
 * product landed before this rule, and whose page explains a missing
 * permission better than an empty shell does.
 */
export const LANDING_FALLBACK: string = ROUTES.PARTIES;

export const landingPath = (sections: readonly NavSectionView[]): string =>
  sections[0]?.items[0]?.href ?? LANDING_FALLBACK;
