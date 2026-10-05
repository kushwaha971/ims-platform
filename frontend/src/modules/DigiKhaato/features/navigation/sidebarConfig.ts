import {
  Armchair,
  BarChart3,
  BookCopy,
  IndianRupee,
  BookOpen,
  BookUser,
  Boxes,
  CreditCard,
  FileText,
  Hourglass,
  LayoutDashboard,
  Receipt,
  ScanLine,
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
export type NavSection = 'daily' | 'business' | 'books' | 'insight' | 'account';

/**
 * The owner's rule (4 Oct 2026): each kind of business gets its OWN menu. A
 * reading room is not a shop with a library bolted on — it has students, seats,
 * shifts and fees, and has no use for Bills, Purchases or a Cashbook in its
 * sidebar. So every row names the workspace it belongs to, and the sidebar
 * shows one workspace at a time. `'any'` rows (Team, Settings) appear in all.
 *
 * A business running more than one (a shop with a reading room upstairs) gets
 * a switcher at the top of the menu; one running a single kind never sees it.
 */
export type Workspace = 'shop' | 'library' | 'lending';

export interface WorkspaceConfig {
  readonly code: Workspace;
  readonly labelId: string;
  /** The paths that put the menu in this workspace when a page under them is open. */
  readonly prefixes: readonly string[];
}

/**
 * In preference order for a business that has not picked one yet: a vertical
 * before the shop, because a tenant that switched on Library or Lending did so
 * to run that, and the shop rows are what every tenant gets by default.
 */
export const WORKSPACES: readonly WorkspaceConfig[] = [
  { code: 'library', labelId: 'nav.workspace.library', prefixes: [ROUTES.LIBRARY_HOME] },
  { code: 'lending', labelId: 'nav.workspace.lending', prefixes: ['/lending'] },
  {
    code: 'shop',
    labelId: 'nav.workspace.shop',
    // Not `/parties` or `/payments`: a library's student opens their khata and a
    // fee receipt there, and that must not throw the menu back to the shop. Not
    // `/dashboard` either: it is where sign-in, a business switch and the logo
    // land, so it follows the workspace rather than choosing one, and sends a
    // library on to the library's own first page.
    prefixes: [
      '/sales',
      '/items',
      '/stock',
      '/purchases',
      '/expenses',
      '/cashbook',
      '/ledger',
      '/reports',
    ],
  },
];

export interface NavItemConfig {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly labelId: string; // i18n key, never a literal
  readonly href: string; // absolute app path
  readonly module: ModuleCode; // gated by tenant.enabled_modules
  readonly permission: PermissionCode; // gated by session.permissions
  readonly section: NavSection;
  /** Which business's menu this row belongs to; `'any'` is shown in every one. */
  readonly workspace: Workspace | 'any';
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
  { key: 'books', labelId: 'nav.section.books' },
  { key: 'insight', labelId: 'nav.section.insight' },
  { key: 'account', labelId: 'nav.section.account' },
];

export const NAV_ITEMS: readonly NavItemConfig[] = [
  {
    // RPT-01 — the landing screen, first in the menu. UAT D8 removed the row
    // while `/dashboard` was a redirect to Customers; the page is built now.
    key: 'dashboard',
    workspace: 'shop',
    ready: true,
    icon: LayoutDashboard,
    labelId: 'nav.dashboard',
    href: ROUTES.DASHBOARD,
    module: 'reports',
    permission: 'reports.basic.read',
    section: 'daily',
    order: 1,
  },
  {
    key: 'parties',
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    workspace: 'shop',
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
    // F05 (LIB-06) — the counter, the screen a library uses most.
    key: 'libraryCounter',
    workspace: 'library',
    ready: true,
    icon: ScanLine,
    labelId: 'nav.library.counter',
    href: ROUTES.LIBRARY_COUNTER,
    module: 'library',
    permission: 'library.loan.write',
    // A study library's books are a side line (owner, 4 Oct 2026): students
    // and seats come first, the book counter sits in its own group below.
    section: 'books',
    order: 2,
  },
  {
    // F04 (LIB-04) — the library's members; a study library's STUDENTS
    // (owner, 4 Oct 2026), so the first of its daily rows.
    key: 'libraryMembers',
    workspace: 'library',
    ready: true,
    icon: Users,
    labelId: 'nav.library.members',
    href: ROUTES.LIBRARY_MEMBERS,
    module: 'library',
    permission: 'library.member.read',
    section: 'daily',
    order: 2,
    bottomNav: true,
  },
  {
    // W03 — the seat map by shift: the room as the librarian sees it.
    key: 'librarySeats',
    workspace: 'library',
    ready: true,
    icon: Armchair,
    labelId: 'nav.library.seats',
    href: ROUTES.LIBRARY_SEATS,
    module: 'library',
    permission: 'library.member.read',
    section: 'daily',
    order: 3,
    bottomNav: true,
  },
  {
    // W03 — who has to pay, and the fee plans.
    key: 'libraryFees',
    workspace: 'library',
    ready: true,
    icon: IndianRupee,
    labelId: 'nav.library.fees',
    href: ROUTES.LIBRARY_FEES,
    module: 'library',
    permission: 'library.member.read',
    section: 'daily',
    order: 4,
    bottomNav: true,
  },
  {
    // F03 (LIB-02) — the library's first page. Shown only while the library
    // module is on; each later library row arrives with its own page (F01).
    key: 'libraryCatalogue',
    workspace: 'library',
    ready: true,
    icon: BookCopy,
    labelId: 'nav.library.catalogue',
    href: ROUTES.LIBRARY_CATALOGUE,
    module: 'library',
    permission: 'library.catalogue.read',
    section: 'books',
    order: 1,
  },
  {
    // F02 (LIB-01 §7) — the library's settings and counters.
    key: 'librarySettings',
    workspace: 'library',
    ready: true,
    icon: Settings,
    labelId: 'nav.library.settings',
    href: ROUTES.LIBRARY_SETTINGS,
    module: 'library',
    permission: 'library.settings.manage',
    section: 'account',
    order: 60,
  },
  {
    // RPT-02/05/06 — the hub lists only the reports that are built.
    key: 'reports',
    workspace: 'shop',
    ready: true,
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
    workspace: 'any',
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
    workspace: 'any',
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
