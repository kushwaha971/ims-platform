/**
 * Part 19 §19.4.5 — one object, grouped by module, mirroring canon §0.8 and
 * Part 22 exactly. Static paths are string constants; parameterised paths are
 * arrow functions. Nothing else lives in this file: no base URL, no query
 * building, no helpers.
 */
export const API_PATHS = {
  // ── auth ──────────────────────────────────────────────────────────────────
  /**
   * CR-2026-09-19-A — `/auth/otp/request` and `/auth/otp/verify` left this list
   * with the flow that called them. Registration is now its own endpoint,
   * because nothing implicitly creates an account any more.
   */
  AUTH_REGISTER: '/auth/register',
  AUTH_LOGIN: '/auth/login',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_ME: '/auth/me',
  AUTH_SWITCH_TENANT: '/auth/switch-tenant',
  AUTH_PASSWORD_SET: '/auth/password/set',
  AUTH_PASSWORD_RESET_REQUEST: '/auth/password/reset/request',
  AUTH_PASSWORD_RESET_CONFIRM: '/auth/password/reset/confirm',

  // ── platform ──────────────────────────────────────────────────────────────
  /** PLT-03 FR-2 / CCR-1 — tenant creation; carries an Idempotency-Key. */
  TENANTS: '/tenants',
  TENANT_CURRENT: '/tenants/current',
  TENANT_SETTINGS: '/tenants/current/settings',
  TENANT_BRANDING: '/tenants/current/branding',
  MEMBERSHIPS: '/memberships',
  MEMBERSHIP: (id: string) => `/memberships/${id}`,
  MEMBERSHIP_INVITE: '/memberships/invite',
  PERMISSIONS_ME: '/permissions/me',
  AUDIT_LOGS: '/audit-logs',

  // ── parties ───────────────────────────────────────────────────────────────
  PARTIES: '/parties',
  PARTY: (id: string) => `/parties/${id}`,
  PARTY_ARCHIVE: (id: string) => `/parties/${id}/archive`,
  PARTY_RESTORE: (id: string) => `/parties/${id}/restore`,
  PARTY_STATEMENT: (id: string) => `/parties/${id}/statement`,
  PARTY_LEDGER_ENTRIES: (id: string) => `/parties/${id}/ledger-entries`,
  PARTY_SHARE_LINKS: (id: string) => `/parties/${id}/share-links`,

  // ── ledger ────────────────────────────────────────────────────────────────
  LEDGER_ENTRIES: '/ledger-entries',
  LEDGER_ENTRY: (id: string) => `/ledger-entries/${id}`,
  LEDGER_ENTRY_REVERSE: (id: string) => `/ledger-entries/${id}/reverse`,
  LEDGER_ENTRY_CORRECT: (id: string) => `/ledger-entries/${id}/correct`,
  LEDGER_SUMMARY: '/ledger/summary',
  LEDGER_AGING: '/ledger/aging',
  REMINDERS: '/reminders',
  REMINDER: (id: string) => `/reminders/${id}`,
  REMINDER_SEND: (id: string) => `/reminders/${id}/send`,
  REMINDERS_BULK: '/reminders/bulk',

  // ── inventory ─────────────────────────────────────────────────────────────
  ITEMS: '/items',
  ITEM: (id: string) => `/items/${id}`,
  ITEM_MOVEMENTS: (id: string) => `/items/${id}/movements`,
  ITEM_LOOKUP: '/items/lookup',
  CATEGORIES: '/categories',
  UNITS: '/units',
  STOCK_ADJUSTMENTS: '/stock-adjustments',
  STOCK_SUMMARY: '/stock/summary',
  STOCK_LOW: '/stock/low',

  // ── sales ─────────────────────────────────────────────────────────────────
  SALES_INVOICES: '/sales/invoices',
  SALES_INVOICE: (id: string) => `/sales/invoices/${id}`,
  SALES_INVOICE_ISSUE: (id: string) => `/sales/invoices/${id}/issue`,
  SALES_INVOICE_VOID: (id: string) => `/sales/invoices/${id}/void`,
  SALES_INVOICE_SHARE_LINKS: (id: string) => `/sales/invoices/${id}/share-links`,
  SALES_INVOICE_UPI_INTENT: (id: string) => `/sales/invoices/${id}/upi-intent`,
  SALES_ESTIMATES: '/sales/estimates',
  SALES_ESTIMATE_CONVERT: (id: string) => `/sales/estimates/${id}/convert`,
  SALES_CREDIT_NOTES: '/sales/credit-notes',

  // ── purchases, payments, expenses, reports, misc ──────────────────────────
  PURCHASE_BILLS: '/purchases/bills',
  PURCHASE_BILL_RECORD: (id: string) => `/purchases/bills/${id}/record`,
  PAYMENTS: '/payments',
  PAYMENT_VOID: (id: string) => `/payments/${id}/void`,
  PAYMENTS_UPI_INTENT: '/payments/upi-intent',
  PAYMENTS_QR: '/payments/qr.svg',
  EXPENSES: '/expenses',
  EXPENSE_CATEGORIES: '/expense-categories',
  REPORT_DASHBOARD: '/reports/dashboard',
  REPORT_DAY_BOOK: '/reports/day-book',
  REPORT_SALES_REGISTER: '/reports/sales-register',
  REPORT_GST_SUMMARY: '/reports/gst-summary',
  REPORT_STOCK_SUMMARY: '/reports/stock-summary',
  REPORT_RECEIVABLES_AGING: '/reports/receivables-aging',
  REPORT_EXPORT: (id: string) => `/reports/exports/${id}`,
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_READ: (id: string) => `/notifications/${id}/read`,
  ATTACHMENTS: '/attachments',
  IMPORTS: '/imports',
  IMPORT: (id: string) => `/imports/${id}`,
  IMPORT_COMMIT: (id: string) => `/imports/${id}/commit`,
  TAX_RATES: '/taxes/rates',
  TAX_HSN: '/taxes/hsn',
  SYSTEM_HEALTH: '/system/health',
  PUBLIC_DOCUMENT: (token: string) => `/public/d/${token}`,
} as const;

/** POSTs that must carry an Idempotency-Key (canon §0.11 rule 5). */
export const IDEMPOTENT_POST_PATHS: readonly string[] = [
  API_PATHS.LEDGER_ENTRIES,
  API_PATHS.SALES_INVOICES,
  API_PATHS.SALES_ESTIMATES,
  API_PATHS.SALES_CREDIT_NOTES,
  API_PATHS.PURCHASE_BILLS,
  API_PATHS.PAYMENTS,
  API_PATHS.STOCK_ADJUSTMENTS,
  API_PATHS.EXPENSES,
  API_PATHS.PARTIES,
  // PLT-03 EC-7 — a lost response after a successful POST /tenants must replay
  // the created tenant, not create a second business.
  API_PATHS.TENANTS,
];

/** True when a POST to this url is on the mandatory-idempotency list. */
export const requiresIdempotency = (url: string | undefined): boolean => {
  if (!url) return false;
  const path = url.split('?')[0] ?? url;
  return IDEMPOTENT_POST_PATHS.some(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`)
  );
};
