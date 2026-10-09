'use client';

import { usePathname } from 'next/navigation';

import { mobileNavState, type MobileNavState } from './mobileNav';
import { useNavigation } from './useNavigation';

import type { AppNavItem } from './appManifest';

export interface UseMobileNavResult extends MobileNavState {
  /** The open app's bottom-nav rows (at most four), in order. */
  readonly tabs: readonly AppNavItem[];
  /** Where Back goes when there is no history to go back to (a deep link). */
  readonly upHref: string | null;
}

/**
 * The phone's navigation state for the current path — read by the tab bar and
 * by the header's Back button, so the two agree on what a "detail screen" is.
 */
export function useMobileNav(): UseMobileNavResult {
  const pathname = usePathname();
  const { sections, bottomNav } = useNavigation();
  const rows = sections.flatMap((section) => section.items);
  const state = mobileNavState(pathname, rows, bottomNav);
  const upHref =
    bottomNav.find((tab) => tab.key === state.active)?.href ?? bottomNav[0]?.href ?? null;
  return { ...state, tabs: bottomNav, upHref };
}
