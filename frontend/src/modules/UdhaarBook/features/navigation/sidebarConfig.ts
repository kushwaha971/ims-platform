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
    href: '/dashboard',
    module: 'reports',
    permission: 'reports.basic.read',
    section: 'daily',
    order: 1,
  },
  {
    key: 'parties',
    icon: BookUser,
    labelId: 'nav.parties',
    href: '/parties',
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
    href: '/ledger/reminders',
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
    href: '/sales/invoices',
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
    href: '/items',
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
    href: '/purchases/bills',
    module: 'purchases',
    permission: 'purchases.bill.read',
    section: 'business',
    order: 3,
  },
  {
    key: 'payments',
    icon: CreditCard,
    labelId: 'nav.payments',
    href: '/payments',
    module: 'payments',
    permission: 'payments.payment.read',
    section: 'business',
    order: 4,
  },
  {
    key: 'expenses',
    icon: Receipt,
    labelId: 'nav.expenses',
    href: '/expenses',
    module: 'expenses',
    permission: 'expenses.expense.read',
    section: 'business',
    order: 5,
  },
  {
    key: 'reports',
    icon: BarChart3,
    labelId: 'nav.reports',
    href: '/reports',
    module: 'reports',
    permission: 'reports.basic.read',
    section: 'insight',
    order: 1,
  },
  {
    key: 'team',
    icon: Users,
    labelId: 'nav.team',
    href: '/settings/team',
    module: 'platform',
    permission: 'platform.members.manage',
    section: 'account',
    order: 1,
  },
  {
    key: 'settings',
    icon: Settings,
    labelId: 'nav.settings',
    href: '/settings',
    module: 'platform',
    permission: 'parties.party.read',
    section: 'account',
    order: 2,
  },
];
