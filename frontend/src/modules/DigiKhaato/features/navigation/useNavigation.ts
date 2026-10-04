'use client';

import { useEffect, useMemo } from 'react';

import { usePathname } from 'next/navigation';

import { useAppSelector } from 'src/hooks/useAppStore';
import {
  selectActiveTenant,
  selectEnabledModules,
  selectPermissions,
} from 'src/redux/slice/sessionSlice';

import {
  NAV_ITEMS,
  NAV_SECTIONS,
  WORKSPACES,
  type NavItemConfig,
  type NavSection,
  type Workspace,
} from './sidebarConfig';
import { rememberWorkspace, useRememberedWorkspace } from './workspaceMemory';

export interface NavSectionView {
  readonly key: NavSection;
  readonly labelId: string;
  readonly items: readonly NavItemConfig[];
}

export interface WorkspaceView {
  readonly code: Workspace;
  readonly labelId: string;
  /** Where the switcher goes: the workspace's first row. */
  readonly href: string;
}

export interface UseNavigationResult {
  readonly sections: readonly NavSectionView[];
  readonly bottomNav: readonly NavItemConfig[];
  /** Every workspace this person can open; the switcher shows when there are two or more. */
  readonly workspaces: readonly WorkspaceView[];
  readonly workspace: Workspace | null;
}

const matches = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The workspace an open page belongs to, by its path, or null for shared pages. */
export const workspaceForPath = (pathname: string | null): Workspace | null =>
  (pathname && WORKSPACES.find((ws) => ws.prefixes.some((p) => matches(pathname, p)))?.code) ||
  null;

/**
 * Part 19 §19.6.2 — the config intersected with entitlements, then narrowed to
 * ONE workspace (owner, 4 Oct 2026: each kind of business has its own menu).
 *
 * The workspace is, in order: the one the open page belongs to; the one this
 * person last used in this business; the first available in `WORKSPACES`'
 * order, which puts a vertical before the shop.
 */
export function useNavigation(): UseNavigationResult {
  const enabledModules = useAppSelector(selectEnabledModules);
  const permissions = useAppSelector(selectPermissions);
  const tenantId = useAppSelector(selectActiveTenant)?.id ?? null;
  const pathname = usePathname();
  const remembered = useRememberedWorkspace(tenantId);
  const fromPath = workspaceForPath(pathname);

  const result = useMemo(() => {
    // Owner rule: an unbuilt feature is not shown. A row whose page does not
    // exist yet (`ready` absent) is left out, not rendered as an inert "Soon".
    const visible = NAV_ITEMS.filter(
      (item) =>
        item.ready === true &&
        enabledModules.includes(item.module) &&
        permissions.includes(item.permission)
    );
    const ordered = [...visible].sort(
      (a, b) =>
        NAV_SECTIONS.findIndex((s) => s.key === a.section) -
          NAV_SECTIONS.findIndex((s) => s.key === b.section) || a.order - b.order
    );
    const workspaces: WorkspaceView[] = WORKSPACES.flatMap((ws) => {
      const first = ordered.find((item) => item.workspace === ws.code);
      return first ? [{ code: ws.code, labelId: ws.labelId, href: first.href }] : [];
    });
    const has = (code: string | null): code is Workspace =>
      !!code && workspaces.some((ws) => ws.code === code);
    const workspace = has(fromPath)
      ? fromPath
      : has(remembered)
        ? remembered
        : (workspaces[0]?.code ?? null);

    const inWorkspace = visible.filter(
      (item) => item.workspace === 'any' || item.workspace === workspace
    );
    const sections = NAV_SECTIONS.map((section) => ({
      ...section,
      items: inWorkspace
        .filter((item) => item.section === section.key)
        .sort((a, b) => a.order - b.order),
    })).filter((section) => section.items.length > 0);

    const bottomNav = inWorkspace.filter((item) => item.bottomNav).slice(0, 4);
    return { sections, bottomNav, workspaces, workspace };
  }, [enabledModules, permissions, fromPath, remembered]);

  // Remember the workspace the open page put the menu in, so Settings and Team
  // (shared by every workspace) keep showing the menu the person came from.
  // Keyed on the codes, not the array: the array is rebuilt whenever the
  // remembered value changes, and re-running on that undid every switcher tap
  // made from a library page before the navigation away had happened.
  const available = result.workspaces.map((ws) => ws.code).join(',');
  useEffect(() => {
    if (tenantId && fromPath && available.split(',').includes(fromPath)) {
      rememberWorkspace(tenantId, fromPath);
    }
  }, [tenantId, fromPath, available]);

  return result;
}
