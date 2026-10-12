import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookUser,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileMinus,
  FileText,
  LayoutDashboard,
  PackageCheck,
  PackageSearch,
  Receipt,
  ShoppingCart,
  Tags,
  Truck,
  Undo2,
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
 * DEC-019 (12 Oct 2026): the khata — You gave / You got, Old dues, Reminders — is
 * the Udhaar book's app now, not the Shop's. The Shop keeps its own Customers and
 * Suppliers, two tabs, each showing what is due on bills.
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
    '/cashbook',
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
      bottomNav: true,
      tabLabelId: 'nav.tab.home',
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
      tabLabelId: 'nav.tab.parties',
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
      // Owner, 12 Oct 2026: "customer and supplier should be two different tabs —
      // both are different". Its own tab on a phone, not a page under Customers.
      bottomNav: true,
      tabLabelId: 'nav.suppliers',
    },
    // DEC-019 — Old dues and Reminders read the Udhaar book's figure, so they are
    // that app's rows now (`features/khata/app.ts`), not the Shop's.
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
      tab: 'invoices',
    },
    // Shop item 3 — a customer's order before it is billed (Vyapar's "Sale order").
    {
      key: 'salesOrders',
      icon: ClipboardCheck,
      labelId: 'nav.salesOrders',
      href: ROUTES.SALES_ORDERS,
      module: 'sales',
      permission: 'sales.estimate.read',
      section: 'sales',
      order: 3,
      tab: 'invoices',
    },
    // Shop item 4 — goods that leave before the bill (SAL-09).
    {
      key: 'challans',
      icon: PackageCheck,
      labelId: 'nav.challans',
      href: ROUTES.SALES_CHALLANS,
      module: 'sales',
      permission: 'sales.invoice.read',
      section: 'sales',
      order: 4,
      tab: 'invoices',
    },
    {
      key: 'creditNotes',
      icon: FileMinus,
      labelId: 'nav.creditNotes',
      href: ROUTES.SALES_CREDIT_NOTES,
      module: 'sales',
      permission: 'sales.invoice.read',
      section: 'sales',
      order: 5,
      tab: 'invoices',
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
    // Shop item 3 — what was asked of a supplier, before the bill came.
    {
      key: 'purchaseOrders',
      icon: ClipboardList,
      labelId: 'nav.purchaseOrders',
      href: ROUTES.PURCHASE_ORDERS,
      module: 'purchases',
      permission: 'purchases.bill.read',
      section: 'purchases',
      order: 2,
    },
    // Shop P0 — goods sent back to a supplier (PUR-07).
    {
      key: 'debitNotes',
      icon: Undo2,
      labelId: 'nav.debitNotes',
      href: ROUTES.DEBIT_NOTES,
      module: 'purchases',
      permission: 'purchases.bill.read',
      section: 'purchases',
      order: 3,
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
      order: 4,
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
      // On a phone Items sits in More while the bar holds Home, Customers,
      // Suppliers and Bills (four tabs and More is the bar's limit).
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
      tab: 'items',
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
      tab: 'items',
    },
    // Shop gap §1.6 — rate cards for groups of customers.
    {
      key: 'priceLists',
      icon: Tags,
      labelId: 'nav.priceLists',
      href: ROUTES.ITEM_PRICE_LISTS,
      module: 'inventory',
      permission: 'inventory.item.read',
      section: 'stock',
      order: 4,
      tab: 'items',
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
  // DEC-019 — a customer's page, opened from here, reads the Shop's book: bills
  // and the payments against them, never their Udhaar book figure.
  book: 'shop',
  peopleHref: ROUTES.CUSTOMERS,
  shell: { partySearch: true },
};
