import {
  BarChart3,
  BookOpen,
  BookUser,
  Boxes,
  CreditCard,
  FileText,
  Hourglass,
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
  /**
   * Does `href` actually resolve to a page yet?
   *
   * Absent means no, which is the safe default: a new entry added here before
   * its route exists is not shown rather than a 404 waiting for a merchant to
   * tap it. `tests/routes.test.ts` asserts every `ready` item has a page, so
   * this cannot drift the other way either.
   *
   * A row that is not ready is NOT RENDERED at all (`useNavigation` drops it).
   * It used to stay visible as an inert "Soon" row, on the theory that it told
   * a shopkeeper what the product would eventually do; the owner's binding
   * rule is "don't show unbuilt features", so Bills, Purchases, Payments and
   * Reports appear the day their pages do and not before. Never rendering them
   * also keeps `next/link` from prefetching pages that 404.
   */
  readonly ready?: boolean;
}

export const NAV_SECTIONS: readonly { readonly key: NavSection; readonly labelId: string }[] = [
  { key: 'daily', labelId: 'nav.section.daily' },
  { key: 'business', labelId: 'nav.section.business' },
  { key: 'insight', labelId: 'nav.section.insight' },
  { key: 'account', labelId: 'nav.section.account' },
];

export const NAV_ITEMS: readonly NavItemConfig[] = [
  /* No "Dashboard" row (UAT D8). `ROUTES.DASHBOARD` is a `redirect()` to the
     party list — the post-login landing path, kept so links and bookmarks
     resolve — and a menu item that silently lands on Customers is a control
     for a feature that does not exist. Add it back, `ready`, with the page. */
  {
    key: 'parties',
    ready: true,
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
    // LED-09 — "who do I ring first". In the DAILY section beside Customers
    // rather than under Reports, because it is the collection round's starting
    // list, not a month-end document.
    key: 'aging',
    ready: true,
    icon: Hourglass,
    labelId: 'nav.aging',
    href: ROUTES.LEDGER_AGING,
    module: 'ledger',
    permission: 'ledger.entry.read',
    section: 'daily',
    order: 3,
  },
  {
    key: 'reminders',
    icon: Wallet,
    labelId: 'nav.reminders',
    href: ROUTES.LEDGER_REMINDERS,
    module: 'ledger',
    permission: 'ledger.entry.read',
    section: 'daily',
    order: 4,
    badge: 'overdueReminders',
    /* LED-05/06/07 — the buckets, manual and bulk reminders, and the history. */
    ready: true,
  },
  {
    key: 'invoices',
    // SAL-02/03/06/07/08 — bills, drafts, walk-in cash sales, print and share.
    ready: true,
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
    // INV-01…INV-08 — items, adjustments, the stock summary and low stock.
    ready: true,
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
    // PUR-01/03/04 — bills, drafts, record and void. Supplier payments are PUR-02.
    ready: true,
    icon: ShoppingCart,
    labelId: 'nav.purchases',
    href: ROUTES.PURCHASE_BILLS,
    module: 'purchases',
    permission: 'purchases.bill.read',
    section: 'business',
    order: 3,
  },
  {
    // PAY-01 … PAY-05 — ready as of the payments wave: list, record, receipt, void.
    key: 'payments',
    ready: true,
    icon: CreditCard,
    labelId: 'nav.payments',
    href: ROUTES.PAYMENTS,
    module: 'payments',
    permission: 'payments.payment.read',
    section: 'business',
    order: 4,
  },
  {
    // EXP-01 — ready as of the expenses wave: list, drawer, void.
    key: 'expenses',
    ready: true,
    icon: Receipt,
    labelId: 'nav.expenses',
    href: ROUTES.EXPENSES,
    module: 'expenses',
    permission: 'expenses.expense.read',
    section: 'business',
    order: 5,
  },
  {
    // EXP-03 — beside Expenses (FRD FR-6 "under Money, beside Expenses").
    // Staff with `expenses.expense.read` see it too: their view is today's
    // till, which the server scopes (FR-13).
    key: 'cashbook',
    ready: true,
    icon: BookOpen,
    labelId: 'nav.cashbook',
    href: ROUTES.CASHBOOK,
    module: 'expenses',
    permission: 'expenses.expense.read',
    section: 'business',
    order: 6,
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
    ready: true,
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
    ready: true,
    icon: Settings,
    labelId: 'nav.settings',
    href: ROUTES.SETTINGS,
    module: 'platform',
    // The owner/admin/accountant gate: the three roles that may at least READ
    // settings (PLT-06 §6). Staff open their own devices from the account menu.
    permission: 'platform.audit.read',
    section: 'account',
    order: 2,
  },
];
