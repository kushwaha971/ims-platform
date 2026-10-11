import { ROUTES } from 'src/routes';

import { activeNavHref } from './activeNav';

import type { AppNavItem } from './appManifest';

/**
 * docs/mobile-redesign/03 — which phone tab is lit, and whether the bar shows.
 *
 * A pure function of the path and the manifests' rows, so the shell never
 * names an app and the rules are tested without rendering anything.
 *
 *  · **The bar shows everywhere except a focused task** (owner, 12 Oct 2026:
 *    "bottom navigation disappears on nested pages"). It used to show only on
 *    a path that IS one of the menu's rows, with "not a row" standing in for
 *    "a detail screen" — which also hid it on every report, every settings
 *    page, the tag manager, a loan, a student, an item: plain pages with
 *    nothing docked at the bottom, where the only way out was Back, pressed
 *    until something familiar appeared. The exceptions are now NAMED, and
 *    each has the reason the old rule gave for all of them — a bar of its own
 *    at the bottom, and a nav bar under a Save button is two bars fighting
 *    for one thumb:
 *      – a form: any path ending in `/new` or `/edit`;
 *      – a khata (`/parties/<id>`), which docks You gave / You got.
 *  · **Top-level** is the old rule, kept for the header: on a menu row or on
 *    More the header shows the brand; anywhere deeper it shows Back.
 *  · **The lit tab** is the bottom-nav row the path is under; else the row a
 *    page declares as its `tab` (Suppliers under Parties, Estimates under
 *    Bills); else More, because every other destination lives there.
 */
export interface MobileNavState {
  readonly visible: boolean;
  /** On one of the menu's own rows, or More: the header shows the brand, not Back. */
  readonly topLevel: boolean;
  /** The `key` of the lit bottom-nav row, or `'more'`, or null when none is. */
  readonly active: string | null;
}

export const MORE_TAB = 'more';

/** A khata: `/parties/<id>` and nothing after it. Its own bar is docked at the bottom. */
const KHATA = new RegExp(`^${ROUTES.PARTIES}/[^/]+$`);

/**
 * A screen with one job and its own actions docked at the bottom. The ONLY
 * screens without the nav bar; add to this list deliberately, with the reason.
 */
export const isFocusedTask = (pathname: string): boolean =>
  /\/(new|edit)$/.test(pathname) || (KHATA.test(pathname) && pathname !== `${ROUTES.PARTIES}/tags`);

export function mobileNavState(
  pathname: string | null,
  rows: readonly AppNavItem[],
  tabs: readonly AppNavItem[]
): MobileNavState {
  if (!pathname) return { visible: false, topLevel: false, active: null };
  if (pathname === ROUTES.MORE) return { visible: true, topLevel: true, active: MORE_TAB };

  const topLevel = rows.some((row) => row.href === pathname);
  const visible = topLevel || !isFocusedTask(pathname);
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
    if (tabs.some((tab) => tab.key === row.key)) return { visible, topLevel, active: row.key };
    const parent = row.tab ? tabs.find((tab) => tab.key === row.tab) : undefined;
    return { visible, topLevel, active: parent ? parent.key : MORE_TAB };
  }
  // A detail page under no row of its own (an invoice under /sales/invoices is
  // a row; a khata at /parties/<id> is not) keeps whichever tab it is under.
  // A page under no row and no tab (a settings page, a report) is one of More's.
  return { visible, topLevel, active: most(tabs)?.key ?? MORE_TAB };
}
