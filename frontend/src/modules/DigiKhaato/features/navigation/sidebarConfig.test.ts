import { ROUTES } from 'src/routes';

import { NAV_ITEMS } from './sidebarConfig';

/**
 * UAT D8 took the sidebar's "Dashboard" away while `/dashboard` was a bare
 * `redirect()` to the party list — a menu item for a feature that did not
 * exist. RPT-01 built the page, so the row is back, `ready`, first in the
 * daily section, gated on the permission the page itself asks for. The
 * guard is now the other half of the same rule: the row is shown because the
 * page exists (`routes.test.ts` asserts every `ready` row has a page), and a
 * reader who may not read reports does not get a row that would send them on.
 */
describe('the sidebar offers the Dashboard now that it exists (RPT-01, UAT D8)', () => {
  it('has one ready dashboard item, leading to /dashboard behind reports.basic.read', () => {
    const dashboard = NAV_ITEMS.filter((item) => item.key === 'dashboard');
    expect(dashboard).toHaveLength(1);
    expect(dashboard[0]).toMatchObject({
      ready: true,
      href: ROUTES.DASHBOARD,
      module: 'reports',
      permission: 'reports.basic.read',
    });
  });

  it('starts the daily section with the Dashboard, then Customers', () => {
    const daily = NAV_ITEMS.filter((item) => item.section === 'daily').sort(
      (a, b) => a.order - b.order
    );
    expect(daily.slice(0, 2).map((item) => item.key)).toEqual(['dashboard', 'parties']);
  });

  it('shows Reports as a built hub', () => {
    expect(NAV_ITEMS.find((item) => item.key === 'reports')).toMatchObject({
      ready: true,
      href: ROUTES.REPORTS,
    });
  });
});
