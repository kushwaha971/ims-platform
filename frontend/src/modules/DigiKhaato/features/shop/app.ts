import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookUser,
  Boxes,
  ClipboardList,
  CreditCard,
  FileMinus,
  FileText,
  Hourglass,
  LayoutDashboard,
  PackageSearch,
  Receipt,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';

import { ROUTES } from 'src/routes';

import type { AppManifest } from '../navigation/appManifest';

/**
 * docs/platform/14 §4.2 — the Shop & billing app's own menu.
 *
 * Grouped the way Vyapar and Zoho Inventory group a shop (owner, 5 Oct 2026:
 * "do it like Vyapar and Zoho, and keep what we have extra"): Parties, Sales,
 * Purchases, Items & stock, Money, Reports. It used to be two flat groups,
 * "Daily" and "Business", with estimates, credit notes and the stock screens
 * reachable only from inside other pages.
 *
 * What is ours and not theirs stays: the khata (Customers), Who owes (aging)
 * and the logged reminders sit under Parties, where a shopkeeper collects.
 */
export const SHOP_APP: AppManifest = {
  code: 'shop',
  labelId: 'nav.workspace.shop',
  // Not `/parties` or `/payments`: a library's student opens their khata and a
  // fee receipt there, and that must not throw the menu back to the shop.
  // `/dashboard` IS the shop's: sign-in lands on the server's `landing.path`
  // and the logo on the open app's first row, so nothing generic goes there
  // any more — and while it followed the app the person was in, choosing Shop
  // in the switcher bounced straight back to the app being left.
  routePrefixes: [
    ROUTES.DASHBOARD,
    ROUTES.CUSTOMERS,
    ROUTES.SUPPLIERS,
    '/sales',
    '/items',
    '/stock',
    '/purchases',
    '/expenses',
    '/cashbook',
    '/ledger',
    '/reports',
  ],
  sections: [
    { key: 'home', labelId: 'nav.section.home' },
    { key: 'parties', labelId: 'nav.section.parties' },
    { key: 'sales', labelId: 'nav.section.sales' },
    { key: 'purchases', labelId: 'nav.section.purchases' },
    { key: 'stock', labelId: 'nav.section.stock' },
    { key: 'money', labelId: 'nav.section.money' },
    { key: 'insight', labelId: 'nav.section.insight' },
  ],
  navigation: [
    // RPT-01 — the landing screen.
    {
      key: 'dashboard',
      icon: LayoutDashboard,
      labelId: 'nav.dashboard',
      href: ROUTES.DASHBOARD,
      module: 'reports',
      permission: 'reports.basic.read',
      section: 'home',
      order: 1,
    },
    // Step 3b — two books, as Zoho and Vyapar keep them: the people you sell
    // to and the people you buy from. A party who is both is in both.
    {
      key: 'customers',
      icon: BookUser,
      labelId: 'nav.parties',
      href: ROUTES.CUSTOMERS,
      module: 'parties',
      permission: 'parties.party.read',
      section: 'parties',
      order: 1,
      bottomNav: true,
    },
    {
      key: 'suppliers',
      icon: Truck,
      labelId: 'nav.suppliers',
      href: ROUTES.SUPPLIERS,
      module: 'parties',
      permission: 'parties.party.read',
      section: 'parties',
      order: 2,
    },
    // LED-09 — "who do I ring first", the collection round's starting list.
    {
      key: 'aging',
      icon: Hourglass,
      labelId: 'nav.aging',
      href: ROUTES.LEDGER_AGING,
      module: 'ledger',
      permission: 'ledger.entry.read',
      section: 'parties',
      order: 3,
    },
    // LED-05/06/07 — the buckets, manual and bulk reminders, and the history.
    {
      key: 'reminders',
      icon: Wallet,
      labelId: 'nav.reminders',
      href: ROUTES.LEDGER_REMINDERS,
      module: 'ledger',
      permission: 'ledger.entry.read',
      section: 'parties',
      order: 4,
      badge: 'overdueReminders',
    },
    // SAL-02/03/06/07/08 — bills, drafts, walk-in cash sales, print and share.
    {
      key: 'invoices',
      icon: FileText,
      labelId: 'nav.invoices',
      href: ROUTES.SALES_INVOICES,
      module: 'sales',
      permission: 'sales.invoice.read',
      section: 'sales',
      order: 1,
      bottomNav: true,
    },
    {
      key: 'estimates',
      icon: ClipboardList,
      labelId: 'nav.estimates',
      href: ROUTES.SALES_ESTIMATES,
      module: 'sales',
      permission: 'sales.estimate.read',
      section: 'sales',
      order: 2,
    },
    {
      key: 'creditNotes',
      icon: FileMinus,
      labelId: 'nav.creditNotes',
      href: ROUTES.SALES_CREDIT_NOTES,
      module: 'sales',
      permission: 'sales.invoice.read',
      section: 'sales',
      order: 3,
    },
    // PUR-01/03/04 — bills, drafts, record and void.
    {
      key: 'purchases',
      icon: ShoppingCart,
      labelId: 'nav.purchases',
      href: ROUTES.PURCHASE_BILLS,
      module: 'purchases',
      permission: 'purchases.bill.read',
      section: 'purchases',
      order: 1,
    },
    // EXP-01 — where Zoho files it: under Purchases.
    {
      key: 'expenses',
      icon: Receipt,
      labelId: 'nav.expenses',
      href: ROUTES.EXPENSES,
      module: 'expenses',
      permission: 'expenses.expense.read',
      section: 'purchases',
      order: 2,
    },
    // INV-01…INV-08 — items, adjustments, the stock summary and low stock.
    {
      key: 'items',
      icon: Boxes,
      labelId: 'nav.items',
      href: ROUTES.ITEMS,
      module: 'inventory',
      permission: 'inventory.item.read',
      section: 'stock',
      order: 1,
      bottomNav: true,
      badge: 'lowStock',
    },
    {
      key: 'stockSummary',
      icon: PackageSearch,
      labelId: 'nav.stockSummary',
      href: ROUTES.STOCK_SUMMARY,
      module: 'inventory',
      permission: 'inventory.stock.read',
      section: 'stock',
      order: 2,
    },
    {
      key: 'lowStock',
      icon: AlertTriangle,
      labelId: 'nav.lowStock',
      href: ROUTES.STOCK_LOW,
      module: 'inventory',
      permission: 'inventory.stock.read',
      section: 'stock',
      order: 3,
    },
    // PAY-01 … PAY-05 — payments in and out, receipts, void.
    {
      key: 'payments',
      icon: CreditCard,
      labelId: 'nav.payments',
      href: ROUTES.PAYMENTS,
      module: 'payments',
      permission: 'payments.payment.read',
      section: 'money',
      order: 1,
    },
    // EXP-03 — the till. Staff with `expenses.expense.read` see today's.
    {
      key: 'cashbook',
      icon: BookOpen,
      labelId: 'nav.cashbook',
      href: ROUTES.CASHBOOK,
      module: 'expenses',
      permission: 'expenses.expense.read',
      section: 'money',
      order: 2,
    },
    // RPT-02/05/06 — the hub lists only the reports that are built.
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
  ],
  shell: { partySearch: true },
};
