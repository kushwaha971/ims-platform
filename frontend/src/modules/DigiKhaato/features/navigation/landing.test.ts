import { ROUTES } from 'src/routes';

import { landingPath, LANDING_FALLBACK } from './landing';
import { NAV_ITEMS } from './sidebarConfig';

import type { NavSectionView } from './useNavigation';

/**
 * R49 — after sign-in a member lands on the dashboard if they hold
 * `reports.basic.read`, else on the first navigation item they can see. The
 * defect prevented: a member without the reports codename (a billing clerk)
 * bounced to Customers, which they may not read either, and met a 403 on the
 * first screen after signing in.
 */
const item = (key: string) => {
  const found = NAV_ITEMS.find((row) => row.key === key);
  if (!found) throw new Error(key);
  return found;
};
const section = (key: NavSectionView['key'], ...keys: string[]): NavSectionView => ({
  key,
  labelId: `nav.section.${key}`,
  items: keys.map(item),
});

it('is the dashboard when the dashboard row is visible — it is always first', () => {
  expect(item('dashboard').permission).toBe('reports.basic.read');
  expect(landingPath([section('daily', 'dashboard', 'parties')])).toBe(ROUTES.DASHBOARD);
});

it('is the first visible item otherwise', () => {
  expect(landingPath([section('daily', 'parties')])).toBe(ROUTES.PARTIES);
  expect(landingPath([section('business', 'invoices', 'items')])).toBe(item('invoices').href);
});

it('falls back to Customers when nothing is visible', () => {
  expect(landingPath([])).toBe(LANDING_FALLBACK);
  expect(LANDING_FALLBACK).toBe(ROUTES.PARTIES);
});
