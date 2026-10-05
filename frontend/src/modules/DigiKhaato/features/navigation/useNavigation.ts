'use client';

import { useEffect, useMemo } from 'react';

import { usePathname } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import {
  selectActiveApp,
  selectEnabledModules,
  selectPermissions,
  selectSessionApps,
} from 'src/redux/slice/sessionSlice';

import { APP_MANIFESTS } from 'modules/appManifests';

import { switchApp } from '../auth/redux/sessionThunk';

import {
  PLATFORM_NAV_ITEMS,
  PLATFORM_SECTION,
  type AppManifest,
  type AppNavItem,
} from './appManifest';

export interface NavSectionView {
  readonly key: string;
  readonly labelId: string;
  readonly items: readonly AppNavItem[];
}

export interface AppView {
  readonly code: string;
  readonly labelId: string;
  /** Where the switcher goes: the server's home for the app, else its first row. */
  readonly href: string;
}

export interface UseNavigationResult {
  readonly sections: readonly NavSectionView[];
  readonly bottomNav: readonly AppNavItem[];
  /** Every app this person can open here; the switcher shows when there are two or more. */
  readonly apps: readonly AppView[];
  /** The app whose menu is showing, or null when the person can open none. */
  readonly app: string | null;
  /** What the shell offers while that app is open (`AppManifest.shell`). */
  readonly shell: NonNullable<AppManifest['shell']>;
}

const matches = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The app an open page belongs to, by its path, or null for a shared page. */
export const appForPath = (
  pathname: string | null,
  manifests: readonly AppManifest[] = APP_MANIFESTS
): string | null =>
  (pathname &&
    manifests.find((app) => app.routePrefixes.some((p) => matches(pathname, p)))?.code) ||
  null;

const NO_SHELL: NonNullable<AppManifest['shell']> = {};

/**
 * docs/platform/14 §4.2 — the sidebar is `currentApp.navigation ∩ entitlements ∩
 * permissions`, plus the platform's own rows.
 *
 * Which apps exist for this person is the server's answer (`apps` on the
 * session: the business runs it and the person holds a grant for it). The app
 * whose menu shows is, in order: the one the open page belongs to; the one the
 * server says they are in (`active_app`, remembered per person per business on
 * any device); the first they can open. A body without `apps` (an old fixture)
 * falls back to "every app with a row this person can see".
 *
 * When a page of another app is opened directly (a deep link, the back
 * button), the server is told, so the switcher, the next sign-in and another
 * device all agree on where this person is.
 */
export function useNavigation(): UseNavigationResult {
  const dispatch = useAppDispatch();
  const enabledModules = useAppSelector(selectEnabledModules);
  const permissions = useAppSelector(selectPermissions);
  const sessionApps = useAppSelector(selectSessionApps);
  const activeApp = useAppSelector(selectActiveApp);
  const pathname = usePathname();
  const fromPath = appForPath(pathname);

  const result = useMemo(() => {
    const visible = (item: AppNavItem): boolean =>
      enabledModules.includes(item.module) && permissions.includes(item.permission);

    const accessible = sessionApps
      ? sessionApps.flatMap((server) => {
          const manifest = APP_MANIFESTS.find((m) => m.code === server.code);
          return manifest ? [{ manifest, home: server.homePath }] : [];
        })
      : APP_MANIFESTS.flatMap((manifest) => {
          const first = manifest.navigation.find(visible);
          return first ? [{ manifest, home: first.href }] : [];
        });
    const has = (code: string | null): boolean =>
      !!code && accessible.some((a) => a.manifest.code === code);
    const code = has(fromPath)
      ? fromPath
      : has(activeApp)
        ? activeApp
        : (accessible[0]?.manifest.code ?? null);
    const current = accessible.find((a) => a.manifest.code === code)?.manifest ?? null;

    const ownSections = current ? current.sections : [];
    const allSections = [...ownSections, PLATFORM_SECTION];
    const rows = [...(current ? current.navigation : []), ...PLATFORM_NAV_ITEMS].filter(visible);
    const sections = allSections
      .map((section) => ({
        ...section,
        items: rows
          .filter((item) => item.section === section.key)
          .sort((a, b) => a.order - b.order),
      }))
      .filter((section) => section.items.length > 0);

    const bottomNav = sections
      .flatMap((section) => section.items)
      .filter((item) => item.bottomNav)
      .slice(0, 4);
    const apps: AppView[] = accessible.map(({ manifest, home }) => ({
      code: manifest.code,
      labelId: manifest.labelId,
      href: home,
    }));
    return { sections, bottomNav, apps, app: code, shell: current?.shell ?? NO_SHELL };
  }, [enabledModules, permissions, sessionApps, activeApp, fromPath]);

  // A page of another app was opened directly: say so, once, so the server's
  // `active_app` follows the person rather than the last switcher tap.
  const syncTo =
    sessionApps && fromPath && fromPath !== activeApp && result.app === fromPath ? fromPath : null;
  useEffect(() => {
    if (syncTo) void dispatch(switchApp({ app: syncTo }));
  }, [dispatch, syncTo]);

  return result;
}
