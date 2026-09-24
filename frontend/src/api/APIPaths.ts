/**
 * Part 19 §19.4.5 — one object, grouped by module, mirroring canon §0.8 and
 * Part 22 exactly. Static paths are string constants; parameterised paths are
 * arrow functions. Nothing else lives in this file: no base URL, no query
 * building, and no helper beyond `seg` below.
 */

/**
 * I-2 (QA, 23 Sep 2026) — every id or token spliced into a path is one
 * `encodeURIComponent`d segment, as `partyPath` in `src/routes.ts` already is.
 * Defence in depth: ids come from the server and from the address bar, and an
 * unencoded `../../auth/logout` or `x?format=csv` would re-address the request
 * to a different endpoint on our own API, with the session's cookies. UUIDs
 * and tokens encode to themselves, so no real URL changes.
 */
const seg = (value: string): string => encodeURIComponent(value);

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
  /** Defect M2 — the unfinished business `POST /tenants` would resume, or null. */
  TENANT_RESUMABLE: '/tenants/resumable',
  TENANT_SETTINGS: '/tenants/current/settings',
  TENANT_BRANDING: '/tenants/current/branding',
  MEMBERSHIPS: '/memberships',
  MEMBERSHIP: (id: string) => `/memberships/${seg(id)}`,
  MEMBERSHIP_INVITE: '/memberships/invite',
  /**
   * PLT-05 — team invitations. A separate collection from `/memberships`
   * on purpose: an invitation is a pending intent addressed to an EMAIL, and it
   * has a lifetime (`expires_at`) and a revocation of its own. A membership is a
   * person who is already in the business. Collapsing the two would mean the
   * team screen could not distinguish "asked and waiting" from "in".
   */
  /** DEC-012 — the team, and adding to it with owner-issued credentials. */
  MEMBERS: '/members',
  MEMBER_CREDENTIALS: (membershipId: string) => `/members/${seg(membershipId)}/credentials`,
  INVITATIONS: '/invitations',
  INVITATION: (id: string) => `/invitations/${seg(id)}`,
  /** PLT-05 FR-10 — the seat-consuming accept. */
  INVITATION_ACCEPT: (token: string) => `/invitations/${seg(token)}/accept`,
  PERMISSIONS_ME: '/permissions/me',
  AUDIT_LOGS: '/audit-logs',
  // ── Track T1: PLT-06, PLT-08, PLT-09 ──────────────────────────────────────
  /** PLT-06 FR-10 — the business type's preset values, for "Reset to defaults". */
  TENANT_SETTINGS_DEFAULTS: '/tenants/current/settings/defaults',
  /** PLT-08 FR-3 — the "Who" filter's options, former members included. */
  AUDIT_LOG_ACTORS: '/audit-logs/actors',
  /** PLT-09 (CR-013) — the caller's own devices. */
  AUTH_SESSIONS: '/auth/sessions',
  AUTH_SESSION: (id: string) => `/auth/sessions/${seg(id)}`,
  /** PLT-09 FR-4 — a manager logs a member out of THIS business. */
  MEMBERSHIP_REVOKE_SESSIONS: (id: string) => `/memberships/${seg(id)}/revoke-sessions`,

  // ── parties ───────────────────────────────────────────────────────────────
  PARTIES: '/parties',
  PARTY: (id: string) => `/parties/${seg(id)}`,
  PARTY_ARCHIVE: (id: string) => `/parties/${seg(id)}/archive`,
  PARTY_RESTORE: (id: string) => `/parties/${seg(id)}/restore`,
  /** LED-04 — the statement, and with `format=csv` the export of it. */
  PARTY_STATEMENT: (id: string) => `/parties/${seg(id)}/statement`,
  PARTY_LEDGER_ENTRIES: (id: string) => `/parties/${seg(id)}/ledger-entries`,
  PARTY_SHARE_LINKS: (id: string) => `/parties/${seg(id)}/share-links`,
  /** PTY-06 — the pre-flight credit check. */
  PARTY_CREDIT_CHECK: (id: string) => `/parties/${seg(id)}/credit-check`,
  /**
   * PTY-05 — the tag collection. Its own constant rather than
   * `${PARTIES}/tags`, because `API_PATHS.PARTIES` is the party SEARCH
   * endpoint and is fenced by lint to `partyService` (Sprint 3 §32.6.7 — no
   * second party fetch; see eslint.config.mjs, PARTY_FETCH_MESSAGE).
   */
  PARTY_TAGS: '/parties/tags',
  PARTY_TAG: (id: string) => `/parties/tags/${seg(id)}`,
  PARTY_TAG_MERGE: (id: string) => `/parties/tags/${seg(id)}/merge`,

  // ── ledger ────────────────────────────────────────────────────────────────
  LEDGER_ENTRIES: '/ledger-entries',
  LEDGER_ENTRY: (id: string) => `/ledger-entries/${seg(id)}`,
  LEDGER_ENTRY_REVERSE: (id: string) => `/ledger-entries/${seg(id)}/reverse`,
  LEDGER_ENTRY_CORRECT: (id: string) => `/ledger-entries/${seg(id)}/correct`,
  /** LED-09 — the tenant's position, and the aging behind it. */
  LEDGER_SUMMARY: '/ledger/summary',
  LEDGER_AGING: '/ledger/aging',
  REMINDERS: '/reminders',
  REMINDER: (id: string) => `/reminders/${seg(id)}`,
  REMINDER_SEND: (id: string) => `/reminders/${seg(id)}/send`,
  REMINDERS_BULK: '/reminders/bulk',
  /** LED-05 FR-4 — the parties behind one bucket (`?bucket=today|overdue|upcoming`). */
  REMINDERS_DUE: '/reminders/due',
  /** LED-06 — the server-composed text for the sheet; writes nothing (CR-LOG). */
  REMINDER_PREVIEW: '/reminders/preview',
  /** LED-07 / LED-08 — the two messaging switches and the provider status. */
  REMINDER_SETTINGS: '/reminders/settings',

  // ── inventory ─────────────────────────────────────────────────────────────
  ITEMS: '/items',
  ITEM: (id: string) => `/items/${seg(id)}`,
  ITEM_MOVEMENTS: (id: string) => `/items/${seg(id)}/movements`,
  ITEM_LOOKUP: '/items/lookup',
  ITEM_ARCHIVE: (id: string) => `/items/${seg(id)}/archive`,
  ITEM_RESTORE: (id: string) => `/items/${seg(id)}/restore`,
  CATEGORIES: '/categories',
  UNITS: '/units',
  STOCK_ADJUSTMENTS: '/stock-adjustments',
  STOCK_ADJUSTMENT: (id: string) => `/stock-adjustments/${seg(id)}`,
  STOCK_SUMMARY: '/stock/summary',
  STOCK_LOW: '/stock/low',

  // ── sales ─────────────────────────────────────────────────────────────────
  SALES_INVOICES: '/sales/invoices',
  SALES_INVOICE: (id: string) => `/sales/invoices/${seg(id)}`,
  SALES_INVOICE_ISSUE: (id: string) => `/sales/invoices/${seg(id)}/issue`,
  SALES_INVOICE_VOID: (id: string) => `/sales/invoices/${seg(id)}/void`,
  SALES_INVOICE_SHARE_LINKS: (id: string) => `/sales/invoices/${seg(id)}/share-links`,
  SALES_INVOICE_UPI_INTENT: (id: string) => `/sales/invoices/${seg(id)}/upi-intent`,
  SALES_ESTIMATES: '/sales/estimates',
  SALES_ESTIMATE_CONVERT: (id: string) => `/sales/estimates/${seg(id)}/convert`,
  SALES_CREDIT_NOTES: '/sales/credit-notes',

  // ── purchases, payments, expenses, reports, misc ──────────────────────────
  PURCHASE_BILLS: '/purchases/bills',
  PURCHASE_BILL_RECORD: (id: string) => `/purchases/bills/${seg(id)}/record`,
  PAYMENTS: '/payments',
  PAYMENT_VOID: (id: string) => `/payments/${seg(id)}/void`,
  PAYMENTS_UPI_INTENT: '/payments/upi-intent',
  PAYMENTS_QR: '/payments/qr.svg',
  EXPENSES: '/expenses',
  EXPENSE: (id: string) => `/expenses/${seg(id)}`,
  EXPENSE_VOID: (id: string) => `/expenses/${seg(id)}/void`,
  EXPENSE_CATEGORIES: '/expense-categories',
  /** EXP-03 — served by the expenses app for now (see its urls.py). */
  CASHBOOK: '/cashbook',
  REPORT_DASHBOARD: '/reports/dashboard',
  REPORT_DAY_BOOK: '/reports/day-book',
  REPORT_SALES_REGISTER: '/reports/sales-register',
  REPORT_GST_SUMMARY: '/reports/gst-summary',
  REPORT_STOCK_SUMMARY: '/reports/stock-summary',
  REPORT_RECEIVABLES_AGING: '/reports/receivables-aging',
  REPORT_EXPORT: (id: string) => `/reports/exports/${seg(id)}`,
  /** IMP-02 FR-8 — the stored file of an export too big to stream. */
  REPORT_EXPORT_DOWNLOAD: (id: string) => `/reports/exports/${seg(id)}/download`,
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_READ: (id: string) => `/notifications/${seg(id)}/read`,
  /** NTF-01 FR-8 — the bell's one number, and the catch-up. */
  NOTIFICATIONS_UNREAD_COUNT: '/notifications/unread-count',
  NOTIFICATIONS_READ_ALL: '/notifications/read-all',
  ATTACHMENTS: '/attachments',
  IMPORTS: '/imports',
  IMPORT: (id: string) => `/imports/${seg(id)}`,
  IMPORT_COMMIT: (id: string) => `/imports/${seg(id)}/commit`,
  IMPORT_CANCEL: (id: string) => `/imports/${seg(id)}/cancel`,
  /** IMP-01 FR-9 — the file with problems; a download link, not a fetch. */
  IMPORT_ERRORS_CSV: (id: string) => `/imports/${seg(id)}/errors.csv`,
  /** IMP-01 FR-2 — the template for a kind; a download link, not a fetch. */
  IMPORT_TEMPLATE: (kind: string) => `/imports/templates/${seg(kind)}.csv`,
  TAX_RATES: '/taxes/rates',
  TAX_HSN: '/taxes/hsn',
  SYSTEM_HEALTH: '/system/health',
  PUBLIC_DOCUMENT: (token: string) => `/public/d/${seg(token)}`,

  // ── PLT-10 — "Your data" (owner only) ─────────────────────────────────────
  TENANT_EXPORT: '/tenants/current/export',
  TENANT_EXPORTS: '/tenants/current/exports',
  TENANT_EXPORT_DETAIL: (id: string) => `/tenants/current/exports/${seg(id)}`,
  TENANT_DELETION: '/tenants/current/deletion',
  TENANT_DELETE_REQUEST: '/tenants/current/delete-request',
  TENANT_DELETE_CANCEL: '/tenants/current/delete-cancel',
  /** PLT-14 FR-6 (CCR-12) — the owner's side of support consent. */
  SUPPORT_ACCESS_REQUESTS: '/support/access-requests',
  SUPPORT_ACCESS_DECISION: (id: string, decision: 'allow' | 'deny' | 'revoke') =>
    `/support/access-requests/${seg(id)}/${decision}`,

  // ── PLT-14 — the super-admin console ──────────────────────────────────────
  ADMIN_OVERVIEW: '/admin/overview',
  ADMIN_TENANTS: '/admin/tenants',
  ADMIN_TENANT: (id: string) => `/admin/tenants/${seg(id)}`,
  ADMIN_TENANT_ACCESS_REQUEST: (id: string) => `/admin/tenants/${seg(id)}/access-requests`,
  ADMIN_TENANT_IMPERSONATE: (id: string) => `/admin/tenants/${seg(id)}/impersonate`,
  ADMIN_IMPERSONATION_END: '/admin/impersonation/end',
  ADMIN_PARTNERS: '/admin/partners',
  ADMIN_PLANS: '/admin/plans',
  ADMIN_HEALTH: '/admin/health',
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
  // INV-01 — a retried item create must not mint a second SKU for one item.
  API_PATHS.ITEMS,
  API_PATHS.EXPENSES,
  API_PATHS.PARTIES,
  /**
   * PLT-05 — a lost response after a successful `POST /invitations` must replay
   * the invitation that was created, not send a second one to the same person
   * with a second link. The one-time `accept_url` makes this sharper than the
   * usual duplicate-row argument: two links for one seat is two ways in.
   */
  API_PATHS.INVITATIONS,
  // DEC-012 — a lost response after a successful POST /members must replay the
  // member that was created. Two of them is two accounts and two seats spent
  // for one salesman, and the second password is the one that works.
  API_PATHS.MEMBERS,
  // PLT-03 EC-7 — a lost response after a successful POST /tenants must replay
  // the created tenant, not create a second business.
  API_PATHS.TENANTS,
];

/**
 * Sub-trees that the prefix rule above would sweep in, and that are idempotent
 * WITHOUT a key.
 *
 * `IDEMPOTENT_POST_PATHS` matches by prefix, which is what makes
 * `POST /parties/{id}/archive` inherit the requirement from `/parties` without
 * anyone having to remember to add it. PTY-05 then hung `/parties/tags` off the
 * same root, and every tag POST started minting a key it does not need and
 * warning, in development, that "a retry will double-post" — which is false for
 * all three of them and is exactly the kind of warning people learn to ignore.
 *
 * Each one is idempotent by its own construction rather than by a stored
 * response:
 *   - `POST /parties/tags` answers 200 with the EXISTING tag for a name that is
 *     already taken (FR-3), so a replay returns the same tag and creates
 *     nothing.
 *   - `POST /parties/tags/bulk` is `bulk_create(ignore_conflicts=True)` for
 *     `add`, a delete-then-insert of a stated set for `replace`, and a delete
 *     for `remove`. Running any of them twice leaves the same rows.
 *   - `POST /parties/tags/{id}/merge` deletes its source, so a replay is a 404
 *     — not a duplicate merge.
 *
 * This is an EXEMPTION LIST and not a loosening of the prefix rule, because the
 * default has to stay "a POST under /parties needs a key". Anything added here
 * is a claim that the endpoint cannot double-write, and it belongs in the same
 * commit as the endpoint that makes the claim true.
 */
export const IDEMPOTENCY_EXEMPT_PATHS: readonly string[] = [
  API_PATHS.PARTY_TAGS,
  /*
   * PLT-10 — the three POSTs under `/tenants/current` are idempotent by
   * construction: `export` returns the export already in flight instead of
   * queueing a second, a repeated `delete-request` meets 409
   * `tenant_pending_deletion`, and a repeated `delete-cancel` meets 412.
   */
  API_PATHS.TENANT_CURRENT,
];

/** True when a POST to this url is on the mandatory-idempotency list. */
export const requiresIdempotency = (url: string | undefined): boolean => {
  if (!url) return false;
  const path = url.split('?')[0] ?? url;
  const matches = (candidate: string) => path === candidate || path.startsWith(`${candidate}/`);
  if (IDEMPOTENCY_EXEMPT_PATHS.some(matches)) return false;
  return IDEMPOTENT_POST_PATHS.some(matches);
};

/**
 * PLT-04 FR-4 — the two endpoints whose job is to MOVE the tab to a different
 * tenant, and which therefore answer with the new tenant's id in `X-Tenant-Id`
 * while the store still holds the old one.
 *
 * The stale-tab guard (`AxiosInstances.ts`) compares that header against
 * `session.activeTenant.id` and rejects a mismatch. For every other response a
 * mismatch means another tab switched business underneath this one. For these
 * two it means the switch WORKED: the response is the authority on the new
 * tenant, not a stale echo of an old one. Without the exemption, every tenant
 * switch and every "Add business" by a merchant who already has one is
 * rejected and the tab reloads back into the tenant it started in.
 *
 * This list is closed and exact on purpose. It is NOT derived from "endpoints
 * that happen to emit the header today" — the server is being changed to emit
 * `X-Tenant-Id` on every tenant-scoped response, at which point the guard
 * starts firing for real and the exemption has to be a deliberate statement
 * about these two transitions rather than a coincidence of which views set a
 * header. `PATCH /tenants/current` is deliberately absent: it is scoped to the
 * tenant the tab is already in, so a mismatch there is a genuine stale tab.
 */
export const TENANT_TRANSITION_PATHS: readonly string[] = [
  API_PATHS.AUTH_SWITCH_TENANT,
  API_PATHS.TENANTS,
];

/**
 * True for a response the tab must accept even though it names another tenant.
 * Exact-match only — `/tenants/current` must not inherit `/tenants`'s exemption,
 * which is why this does not reuse `requiresIdempotency`'s prefix matching.
 */
export const isTenantTransitionPath = (url: string | undefined): boolean => {
  if (!url) return false;
  const path = url.split('?')[0] ?? url;
  return TENANT_TRANSITION_PATHS.includes(path);
};
