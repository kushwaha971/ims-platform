import {
  BarChart3,
  BookUser,
  Boxes,
  CreditCard,
  FileText,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { ROUTES } from 'src/routes';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

/**
 * Part 19 §19.6.2 — navigation is DATA, not markup.
 *
 * `useNavigation()` intersects this config with the tenant's `enabled_modules`
 * and the user's permissions. A module the tenant has not enabled, or that the
 * user cannot read, simply does not exist in the menu — it is never rendered
 * disabled (§19.7.5).
 */
export type NavSection = 'daily' | 'business' | 'insight' | 'account';

export interface NavItemConfig {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly labelId: string; // i18n key, never a literal
  readonly href: string; // absolute app path
  readonly module: ModuleCode; // gated by tenant.enabled_modules
  readonly permission: PermissionCode; // gated by session.permissions
  readonly section: NavSection;
  readonly order: number;
  /** Shown in the mobile bottom nav (max 4 + "More"). */
  readonly bottomNav?: boolean;
  /** Slice selector key for the badge count, if any. */
  readonly badge?: 'overdueReminders' | 'lowStock' | 'unreadNotifications';
}

export const NAV_SECTIONS: readonly { readonly key: NavSection; readonly labelId: string }[] = [
  { key: 'daily', labelId: 'nav.section.daily' },
  { key: 'business', labelId: 'nav.section.business' },
  { key: 'insight', labelId: 'nav.section.insight' },
  { key: 'account', labelId: 'nav.section.account' },
];

export const NAV_ITEMS: readonly NavItemConfig[] = [
  {
    key: 'dashboard',
    icon: BarChart3,
    labelId: 'nav.dashboard',
    href: ROUTES.DASHBOARD,
    module: 'reports',
    permission: 'reports.basic.read',
    section: 'daily',
    order: 1,
  },
  {
    key: 'parties',
    icon: BookUser,
    labelId: 'nav.parties',
    href: ROUTES.PARTIES,
    module: 'parties',
    permission: 'parties.party.read',
    section: 'daily',
    order: 2,
    bottomNav: true,
  },
  {
    key: 'reminders',
    icon: Wallet,
    labelId: 'nav.reminders',
    href: ROUTES.LEDGER_REMINDERS,
    module: 'ledger',
    permission: 'ledger.entry.read',
    section: 'daily',
    order: 3,
    badge: 'overdueReminders',
  },
  {
    key: 'invoices',
    icon: FileText,
    labelId: 'nav.invoices',
    href: ROUTES.SALES_INVOICES,
    module: 'sales',
    permission: 'sales.invoice.read',
    section: 'business',
    order: 1,
    bottomNav: true,
  },
  {
    key: 'items',
    icon: Boxes,
    labelId: 'nav.items',
    href: ROUTES.ITEMS,
    module: 'inventory',
    permission: 'inventory.item.read',
    section: 'business',
    order: 2,
    bottomNav: true,
    badge: 'lowStock',
  },
  {
    key: 'purchases',
    icon: ShoppingCart,
    labelId: 'nav.purchases',
    href: ROUTES.PURCHASE_BILLS,
    module: 'purchases',
    permission: 'purchases.bill.read',
    section: 'business',
    order: 3,
  },
  {
    key: 'payments',
    icon: CreditCard,
    labelId: 'nav.payments',
    href: ROUTES.PAYMENTS,
    module: 'payments',
    permission: 'payments.payment.read',
    section: 'business',
    order: 4,
  },
  {
    key: 'expenses',
    icon: Receipt,
    labelId: 'nav.expenses',
    href: ROUTES.EXPENSES,
    module: 'expenses',
    permission: 'expenses.expense.read',
    section: 'business',
    order: 5,
  },
  {
    key: 'reports',
    icon: BarChart3,
    labelId: 'nav.reports',
    href: ROUTES.REPORTS,
    module: 'reports',
    permission: 'reports.basic.read',
    section: 'insight',
    order: 1,
  },
  {
    key: 'team',
    icon: Users,
    labelId: 'nav.team',
    href: ROUTES.SETTINGS_TEAM,
    module: 'platform',
    permission: 'platform.members.manage',
    section: 'account',
    order: 1,
  },
  {
    key: 'settings',
    icon: Settings,
    labelId: 'nav.settings',
    href: ROUTES.SETTINGS,
    module: 'platform',
    permission: 'parties.party.read',
    section: 'account',
    order: 2,
  },
];
