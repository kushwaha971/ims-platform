import { ROUTES } from 'src/routes';

import { NAV_ITEMS } from './sidebarConfig';

/**
 * UAT D8 — the sidebar's "Dashboard" was a `ready` link to `/dashboard`, and
 * `/dashboard` is a bare `redirect()` to the party list. A merchant tapped
 * Dashboard and landed on Customers with nothing to say why — a menu item for a
 * feature that does not exist, dressed as one that does. Owner rule: an
 * unbuilt feature is not shown. It comes back when a dashboard page does.
 */
describe('the sidebar offers no Dashboard until one exists (UAT D8)', () => {
  it('has no dashboard item', () => {
    expect(NAV_ITEMS.map((item) => item.key)).not.toContain('dashboard');
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain(ROUTES.DASHBOARD);
  });

  it('still starts the daily section with Customers', () => {
    const daily = NAV_ITEMS.filter((item) => item.section === 'daily').sort(
      (a, b) => a.order - b.order
    );
    expect(daily[0]?.key).toBe('parties');
  });
});
