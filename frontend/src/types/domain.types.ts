/**
 * Shared enums mirrored from canon §0.3 and §0.9. These are `as const` objects
 * plus derived unions, never TypeScript `enum`s (R-TS-8).
 */

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

/** Canon §0.3 module map. A module the tenant has not enabled does not exist. */
export const MODULE_CODES = [
  'platform',
  'parties',
  'ledger',
  'inventory',
  'sales',
  'purchases',
  'payments',
  'expenses',
  'reports',
  'notifications',
  'import_export',
  'help',
  'loans',
  'accounting',
] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

/**
 * Canon §0.9 permission codenames. Sprint 0 carries the subset the walking
 * skeleton and the Sprint 0 sidebar name; the registry grows per feature and
 * the backend's registry test is the authority on the full set.
 */
export const PERMISSION_CODES = [
  'parties.party.read',
  'parties.party.write',
  /**
   * PTY-04 — archiving IS the delete capability, because the product has no
   * hard delete: deleting a party would destroy the ledger behind it. The
   * codename is the server's (`common/permissions_registry.py`), and it is
   * what gates Archive, Restore and the bulk clean-up.
   */
  'parties.party.delete',
  /** IMP-02 — canon §0.9's dedicated party-export codename (not staff). */
  'parties.party.export',
  'ledger.entry.read',
  'ledger.entry.write',
  /**
   * LED-03 BR-8 — reversing and correcting a posted line.
   *
   * Separate from `write` because they are separate jobs. Staff record what
   * happens at the counter; going back and changing a number a customer has
   * already been shown is the owner's decision, and the server's registry gives
   * this to the owner and the manager only. A tenant that wants their senior
   * cashier to fix typos can grant it — unlike the credit-limit override, which
   * is a role check precisely so that it cannot be granted.
   */
  'ledger.entry.correct',
  /**
   * LED-04 §12 — taking the statement away as a file.
   *
   * Separate from `ledger.entry.read` because reading a customer's history at
   * the counter and walking out with the whole book in a CSV are not the same
   * act. Staff hold the first and not this; the accountant holds both, which is
   * their job. The server checks the same codename on the same URL, because the
   * export is a query parameter rather than a route of its own.
   */
  'ledger.statement.export',
  /**
   * LED-06 §12 — recording a reminder. Sending one from the khata writes a
   * `ledger_reminder` row, so reading the khata is not enough; the accountant
   * reads and does not chase.
   */
  'ledger.reminder.write',
  'inventory.item.read',
  /* INV-01…INV-08 §12 — the item master, archive, stock reads and adjustments.
     `inventory.stock.adjust` is off for staff unless granted by override. */
  'inventory.item.write',
  'inventory.item.delete',
  'inventory.stock.read',
  'inventory.stock.adjust',
  'reports.financial.read',
  'sales.invoice.read',
  /** SAL-02 §12 — create, edit and issue a bill; the accountant never holds it. */
  'sales.invoice.write',
  'purchases.bill.read',
  'payments.payment.read',
  /** PAY-01 / PAY-05 §12 — record (owner, admin, staff) and void (owner, admin only). */
  'payments.payment.write',
  'payments.payment.void',
  'expenses.expense.read',
  /** EXP-01 §12 — record (owner, admin, staff) and void (owner, admin only). */
  'expenses.expense.write',
  'expenses.expense.void',
  'reports.basic.read',
  /**
   * EXP-03 FR-13 — the cashbook beyond today's till: any range, the bank
   * bucket, the category breakdown. The server enforces it; the client only
   * decides which controls to draw.
   */
  'reports.financial.read',
  /**
   * LED-09 §12 — taking a report away as a file.
   *
   * The same act `ledger.statement.export` gates one party at a time, at the
   * scale of the whole book: staff chase collections and do not leave with the
   * debtor list. The accountant holds both, which is their job.
   */
  'reports.export',
  'platform.members.manage',
  'platform.settings.manage',
  // Track T1 — the canon codenames the settings surfaces gate on (canon §0.9;
  // `apps/common/permissions_registry.py`). `platform.settings.manage` above is
  // not in the server's registry and nothing reads it; left in place rather
  // than removed by a feature that does not own it.
  'platform.tenant.manage',
  'platform.branding.manage',
  'platform.audit.read',
  /** LED-07 FR-1 / LED-08 FR-1 — the two SMS switches; owner and admin. */
  'notifications.settings.manage',
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];

export type ThemeMode = 'light' | 'dark';

/** Part 21 §21.3.3 — a party is active or archived; nothing else at MVP. */
export type PartyStatus = 'active' | 'archived';

/**
 * Canon §0.7 — the roles a membership or an invitation carries.
 *
 * Mirrored from the server's `common.constants.Role`; `super_admin` is NOT here
 * because it is a platform role rather than a tenant one, and nothing a tenant
 * user can do in this product may hand it out. `tenant.role.<code>` is the
 * translated label for each, and it already existed for the switcher.
 */
export const TENANT_ROLES = ['owner', 'admin', 'staff', 'accountant'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/** Canon §0.7 Invitation.status — mirrors `platform_app.constants.InvitationStatus`. */
export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * Part 21 §21.3.4 `ledger_entry.payment_mode` — how money arrived.
 *
 * Here rather than in the ledger feature because it is not the ledger's alone:
 * PAY-01's payments, EXP-01's expenses and EXP-03's cashbook all carry the same
 * six values, and a second copy is how the two copies eventually disagree about
 * whether the third one is spelled `bank` or `bank_transfer`.
 *
 * An array rather than a bare union so a control can map over it without a
 * second list to keep in step — the order is the order the chips appear in, and
 * it is frequency order for an Indian counter: cash first, UPI beside it, the
 * rest behind them.
 */
export const PAYMENT_MODES = ['cash', 'upi', 'bank', 'cheque', 'card', 'other'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/**
 * Which UPI app the money came through — `ledger_entry.upi_app`, meaningful
 * only when the mode is `upi` (the server nulls it otherwise). The app rather
 * than a PSP handle because it is what the merchant hears: "PhonePe kiya".
 * Order matches the server's `UpiApp` choices.
 */
export const UPI_APPS = [
  'phonepe',
  'gpay',
  'paytm',
  'bhim',
  'amazonpay',
  'cred',
  'whatsapp',
  'navi',
  'supermoney',
  'bank_app',
  'other',
] as const;
export type UpiApp = (typeof UPI_APPS)[number];

/** The three apps that carry most of India's UPI volume get chips of their
 *  own; the rest sit behind "Other UPI". */
export const FEATURED_UPI_APPS = ['phonepe', 'gpay', 'paytm'] as const satisfies readonly UpiApp[];
