import { ROUTES } from 'src/routes';

import { activeNavHref } from './activeNav';

import type { AppNavItem } from './appManifest';

/**
 * docs/mobile-redesign/03 — which phone tab is lit, and whether the bar shows.
 *
 * A pure function of the path and the manifests' rows, so the shell never
 * names an app and the rules are tested without rendering anything.
 *
 *  · **The bar shows on top-level screens only**: a path that IS one of the
 *    menu's own rows, or More. A khata, a bill, a "new bill" form are detail
 *    and task screens — they have their own back arrow and their own docked
 *    actions at the bottom, and a nav bar under a Save button is two bars
 *    fighting for one thumb.
 *  · **The lit tab** is the bottom-nav row the path is under; else the row a
 *    page declares as its `tab` (Suppliers under Parties, Estimates under
 *    Bills); else More, because every other destination lives there.
 */
export interface MobileNavState {
  readonly visible: boolean;
  /** The `key` of the lit bottom-nav row, or `'more'`, or null when none is. */
  readonly active: string | null;
}

export const MORE_TAB = 'more';

export function mobileNavState(
  pathname: string | null,
  rows: readonly AppNavItem[],
  tabs: readonly AppNavItem[]
): MobileNavState {
  if (!pathname) return { visible: false, active: null };
  if (pathname === ROUTES.MORE) return { visible: true, active: MORE_TAB };

  const visible = rows.some((row) => row.href === pathname);
  const most = (items: readonly AppNavItem[]): AppNavItem | undefined => {
    const href = activeNavHref(
      pathname,
      items.map((item) => item.href)
    );
    return items.find((item) => item.href === href);
  };

  // The most specific menu row wins first, so /library/attendance is More and
  // not "Today" just because it sits under /library.
  const row = most(rows);
  if (row) {
    if (tabs.some((tab) => tab.key === row.key)) return { visible, active: row.key };
    const parent = row.tab ? tabs.find((tab) => tab.key === row.tab) : undefined;
    return { visible, active: parent ? parent.key : MORE_TAB };
  }
  // A detail page under no row of its own (an invoice under /sales/invoices is
  // a row; a khata at /parties/<id> is not) keeps whichever tab it is under.
  return { visible, active: most(tabs)?.key ?? null };
}
