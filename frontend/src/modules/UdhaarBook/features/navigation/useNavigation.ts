'use client';

import { useMemo } from 'react';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectEnabledModules, selectPermissions } from 'src/redux/slice/sessionSlice';

import { NAV_ITEMS, NAV_SECTIONS, type NavItemConfig, type NavSection } from './sidebarConfig';

export interface NavSectionView {
  readonly key: NavSection;
  readonly labelId: string;
  readonly items: readonly NavItemConfig[];
}

export interface UseNavigationResult {
  readonly sections: readonly NavSectionView[];
  readonly bottomNav: readonly NavItemConfig[];
}

/**
 * Part 19 §19.6.2 — the config intersected with entitlements. Sprint 0 leaves
 * the badge counts out: the slices that supply them (reminders, low stock,
 * notifications) arrive with their own sprints, and a badge wired to a zero is
 * worse than no badge.
 */
export function useNavigation(): UseNavigationResult {
  const enabledModules = useAppSelector(selectEnabledModules);
  const permissions = useAppSelector(selectPermissions);

  return useMemo(() => {
    const visible = NAV_ITEMS.filter(
      (item) => enabledModules.includes(item.module) && permissions.includes(item.permission)
    );
    const sections = NAV_SECTIONS.map((section) => ({
      ...section,
      items: visible
        .filter((item) => item.section === section.key)
        .sort((a, b) => a.order - b.order),
    })).filter((section) => section.items.length > 0);

    const bottomNav = visible.filter((item) => item.bottomNav).slice(0, 4);
    return { sections, bottomNav };
  }, [enabledModules, permissions]);
}
