import { Settings, Users, type LucideIcon } from 'lucide-react';

import { ROUTES } from 'src/routes';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

/**
 * docs/platform/14 §4.2 — an app's navigation is the APP's, declared in its own
 * folder (`features/<app>/app.ts`), and listed once in `src/modules/appManifests.ts`.
 *
 * This replaced `sidebarConfig.ts`: one 498-line list of every row of every app,
 * each tagged with a closed `'shop' | 'library' | 'lending'` union, so a new app
 * meant editing shared files in six places and every app read from the same
 * list. The shell now knows apps only through their manifests and never by name;
 * an architecture test fails the build if shared code names one.
 *
 * Which apps a person may open, and which they are in, is the SERVER's
 * (`apps`, `active_app` on the session, from its app registry and the person's
 * grants). A manifest only says what the app looks like.
 */
export interface AppNavItem {
  readonly key: string;
  readonly icon: LucideIcon;
  /** i18n key, never a literal. */
  readonly labelId: string;
  /** Absolute app path; `src/tests/routes.test.ts` proves a page is behind it. */
  readonly href: string;
  /** Gated by the tenant's effective modules (a capability, not the app). */
  readonly module: ModuleCode;
  /** Gated by the session's permissions. */
  readonly permission: PermissionCode;
  /** One of the manifest's own `sections`. */
  readonly section: string;
  readonly order: number;
  /** Shown in the mobile bottom nav (max 4 + "More"). */
  readonly bottomNav?: boolean;
  /** Slice selector key for the badge count, if any. */
  readonly badge?: 'overdueReminders' | 'lowStock' | 'unreadNotifications';
}

export interface AppNavSection {
  readonly key: string;
  readonly labelId: string;
}

export interface AppManifest {
  /** The server's app code (`apps_registry`), e.g. `shop`, `library`. */
  readonly code: string;
  readonly labelId: string;
  /**
   * Paths that belong to this app: a page under one opens this app's menu.
   * Shared pages (a party's khata, a payment receipt, settings) belong to no
   * app and keep the menu of the app the person is in.
   */
  readonly routePrefixes: readonly string[];
  /** The app's own groups, in order. The platform's `account` group follows. */
  readonly sections: readonly AppNavSection[];
  /**
   * Only built pages: the owner's rule is that an unbuilt feature is not shown,
   * not even as an inert "Soon" row, so a row is added the day its page is.
   */
  readonly navigation: readonly AppNavItem[];
  /** What the shell offers while this app is open, by capability, never by name. */
  readonly shell?: {
    /** The top bar's party search (the Shop's customers and suppliers). */
    readonly partySearch?: boolean;
  };
}

/** The platform's own rows, in every app: they belong to the business. */
export const PLATFORM_SECTION: AppNavSection = { key: 'account', labelId: 'nav.section.account' };

export const PLATFORM_NAV_ITEMS: readonly AppNavItem[] = [
  {
    key: 'team',
    icon: Users,
    labelId: 'nav.team',
    href: ROUTES.SETTINGS_TEAM,
    module: 'platform',
    permission: 'platform.members.manage',
    section: PLATFORM_SECTION.key,
    order: 1,
  },
  {
    key: 'settings',
    icon: Settings,
    labelId: 'nav.settings',
    href: ROUTES.SETTINGS,
    module: 'platform',
    // The owner/admin/accountant gate: the three roles that may at least READ
    // settings (PLT-06 §6). Staff open their own devices from the account menu.
    permission: 'platform.audit.read',
    section: PLATFORM_SECTION.key,
    order: 2,
  },
];
